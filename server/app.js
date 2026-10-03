import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  cleanLead,
  normalizePhone,
  maskPhone,
  businessMatches,
  passwordHash,
  passwordMatches,
  validateDisposition,
  STATUSES,
} from './domain.js';

const now = () => new Date().toISOString();
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = ({ password, ...user }) => user;
const safeCell = (value) =>
  typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
});

export function createApp(db) {
  const app = express();
  const streams = new Set();
  const changed = () => {
    for (const stream of streams) stream.write('event: refresh\ndata: {}\n\n');
  };
  const production = process.env.NODE_ENV === 'production';
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const allowed = new Set([process.env.APP_URL ?? 'http://localhost:4000']);
    if (process.env.VERCEL) {
      for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
        if (host) allowed.add(`https://${host}`);
      }
    }
    if (!production) {
      allowed.add('http://localhost:5173');
      allowed.add('http://127.0.0.1:5173');
      allowed.add('http://127.0.0.1:4000');
    }
    if (origin && !allowed.has(origin))
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 400,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Please slow down and try again.' },
  });
  app.get('/api/health', async (_req, res) => {
    await db.get('SELECT 1 AS ready');
    res.json({ ok: true, database: db.kind });
  });
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE email=?', [email]);
    if (!user || !passwordMatches(String(req.body.password ?? ''), user.password) || !user.active)
      fail('Email or password is incorrect.', 401);
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(24).toString('hex');
    await db.tx(async (tx) => {
      await tx.run('DELETE FROM sessions WHERE expires_at<?', [now()]);
      await tx.run('INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES(?,?,?,?)', [
        hash(token),
        user.id,
        csrf,
        new Date(Date.now() + 12 * 3600000).toISOString(),
      ]);
      await tx.run('UPDATE users SET last_seen=? WHERE id=?', [now(), user.id]);
    });
    res.cookie('relay_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
      maxAge: 12 * 3600000,
      path: '/',
    });
    res.json({ user: publicUser(user), csrf });
  });
  app.use('/api', apiLimiter, async (req, res, next) => {
    const token = req.cookies.relay_session;
    const session =
      token &&
      (await db.get('SELECT * FROM sessions WHERE token=? AND expires_at>?', [hash(token), now()]));
    if (!session) return res.status(401).json({ error: 'Please sign in to continue.' });
    const user = await db.get('SELECT * FROM users WHERE id=? AND active=1', [session.user_id]);
    if (!user) return res.status(401).json({ error: 'Your account is inactive.' });
    req.user = publicUser(user);
    req.session = session;
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('x-csrf-token') !== session.csrf
    )
      return res.status(403).json({ error: 'Security token expired. Refresh and try again.' });
    next();
  });
  const manager = (req, _res, next) => {
    if (req.user.role === 'agent') fail('Manager access required.', 403);
    next();
  };
  const audit = async (tx, req, action, leadId = null, detail = '') =>
    tx.run(
      'INSERT INTO audit(id,user_id,lead_id,action,detail,ip,created_at) VALUES(?,?,?,?,?,?,?)',
      [randomUUID(), req.user.id, leadId, action, detail, req.ip ?? '', now()],
    );
  const getLead = async (tx, id, user) => {
    const lead = await tx.get(
      'SELECT l.*,u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=?',
      [id],
    );
    if (!lead) fail('Lead not found.', 404);
    if (user.role === 'agent' && lead.owner_id !== user.id)
      fail('This lead is assigned to another workspace.', 403);
    return lead;
  };
  const displayLead = (lead, user, revealed = false) => ({
    ...lead,
    phone: user.role === 'agent' && !revealed ? maskPhone(lead.phone) : lead.phone,
  });
  async function duplicates(tx, lead, exclude = '') {
    const exact = await tx.all(
      'SELECT l.*,u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id<>? AND (l.phone=? OR (l.email<>? AND l.email=?))',
      [exclude, lead.phone, '', lead.email],
    );
    if (exact.length)
      return exact.map((l) => ({ lead: l, tier: l.phone === lead.phone ? 'phone' : 'email' }));
    const local = await tx.all(
      'SELECT l.*,u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE LOWER(l.city)=LOWER(?) AND l.id<>?',
      [lead.city, exclude],
    );
    return local
      .filter((l) => businessMatches(l.business, lead.business))
      .map((l) => ({ lead: l, tier: 'business' }));
  }
  async function insertLead(tx, lead, owner = null) {
    const id = randomUUID(),
      date = now();
    await tx.run(
      'INSERT INTO leads(id,business,contact,phone,email,city,category,source,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [
        id,
        lead.business,
        lead.contact,
        lead.phone,
        lead.email,
        lead.city,
        lead.category,
        lead.source,
        owner,
        date,
        date,
      ],
    );
    return id;
  }
  function leadFilter(req) {
    const clauses = [],
      args = [];
    const q = req.query;
    if (req.user.role === 'agent') {
      clauses.push('l.owner_id=?');
      args.push(req.user.id);
    }
    if (q.search) {
      clauses.push('(LOWER(l.business) LIKE ? OR LOWER(l.contact) LIKE ? OR LOWER(l.city) LIKE ?)');
      const term = `%${String(q.search).toLowerCase().slice(0, 120)}%`;
      args.push(term, term, term);
    }
    for (const key of ['category', 'city', 'status', 'source'])
      if (q[key]) {
        clauses.push(`l.${key}=?`);
        args.push(q[key]);
      }
    if (q.open === 'true') clauses.push("l.status NOT IN ('Closed Won','Not Interested')");
    if (q.owner && req.user.role !== 'agent') {
      if (q.owner === 'unassigned') clauses.push('l.owner_id IS NULL');
      else {
        clauses.push('l.owner_id=?');
        args.push(q.owner);
      }
    }
    if (q.from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from)) fail('Invalid start date.');
      clauses.push('l.created_at>=?');
      args.push(q.from);
    }
    if (q.to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.to)) fail('Invalid end date.');
      clauses.push('l.created_at<=?');
      args.push(q.to + 'T23:59:59.999Z');
    }
    return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', args };
  }
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user, csrf: req.session.csrf }));
  app.post('/api/auth/logout', async (req, res) => {
    await db.tx((tx) => tx.run('DELETE FROM sessions WHERE token=?', [req.session.token]));
    res.clearCookie('relay_session', { path: '/' });
    res.json({ ok: true });
  });
  app.post('/api/auth/password', async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!passwordMatches(String(req.body.current ?? ''), user.password))
      fail('Current password is incorrect.');
    if (String(req.body.password ?? '').length < 12)
      fail('Use at least 12 characters for your new password.');
    await db.tx(async (tx) => {
      await tx.run('UPDATE users SET password=? WHERE id=?', [
        passwordHash(req.body.password),
        user.id,
      ]);
      await tx.run('DELETE FROM sessions WHERE user_id=? AND token<>?', [
        user.id,
        req.session.token,
      ]);
      await audit(tx, req, 'password_changed');
    });
    res.json({ ok: true });
  });
  app.post('/api/presence', async (req, res) => {
    await db.tx((tx) => tx.run('UPDATE users SET last_seen=? WHERE id=?', [now(), req.user.id]));
    res.json({ ok: true });
  });
  app.get('/api/events', (req, res) => {
    // Serverless instances use the client's periodic refresh instead of a long-lived stream.
    if (process.env.VERCEL) return res.status(204).end();
    res.set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    streams.add(res);
    const timer = setInterval(async () => {
      try {
        const live = await db.get(
          'SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1',
          [req.session.token, now()],
        );
        if (!live) return res.end();
        res.write(': heartbeat\n\n');
      } catch {
        res.end();
      }
    }, 25000);
    req.on('close', () => {
      clearInterval(timer);
      streams.delete(res);
    });
  });
  app.get('/api/meta', async (req, res) => {
    const scoped = req.user.role === 'agent' ? ' WHERE owner_id=?' : '';
    const args = req.user.role === 'agent' ? [req.user.id] : [];
    const leads = await db.all('SELECT DISTINCT category,city,source FROM leads' + scoped, args);
    const users = await db.all(
      'SELECT id,name,email,role,active,available,last_seen FROM users' +
        (req.user.role === 'agent' ? ' WHERE id=?' : ''),
      args,
    );
    const settings = Object.fromEntries(
      (await db.all('SELECT * FROM settings')).map((s) => [s.key, s.value]),
    );
    const active = await db.get(
      'SELECT w.*,l.business FROM active_work w JOIN leads l ON l.id=w.lead_id WHERE w.user_id=?',
      [req.user.id],
    );
    res.json({
      categories: [
        ...new Set([
          'Hospitals',
          'Electricians',
          'B2B Contractors',
          'Logistics',
          'Other',
          ...leads.map((l) => l.category),
        ]),
      ].sort(),
      cities: [...new Set(leads.map((l) => l.city))].sort(),
      sources: [...new Set(leads.map((l) => l.source))].sort(),
      users,
      settings,
      active: active ?? null,
      statuses: STATUSES,
    });
  });
  app.get('/api/leads', async (req, res) => {
    const f = leadFilter(req),
      page = Math.max(1, parseInt(req.query.page) || 1),
      size = Math.min(100, Math.max(1, parseInt(req.query.size) || 12));
    const count = await db.get('SELECT COUNT(*) AS count FROM leads l' + f.sql, f.args);
    const leads = await db.all(
      'SELECT l.*,u.name AS owner_name FROM leads l LEFT JOIN users u ON l.owner_id=u.id' +
        f.sql +
        ' ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?',
      [...f.args, size, (page - 1) * size],
    );
    res.json({
      leads: leads.map((l) => displayLead(l, req.user)),
      total: Number(count.count),
      page,
      size,
    });
  });
  app.get('/api/callbacks', async (req, res) => {
    const args = [];
    let clause = " WHERE l.status='Callback Scheduled' AND l.callback_at IS NOT NULL";
    if (req.user.role === 'agent') {
      clause += ' AND l.owner_id=?';
      args.push(req.user.id);
    }
    const leads = await db.all(
      'SELECT l.*,u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id' +
        clause +
        ' ORDER BY l.callback_at',
      args,
    );
    res.json({ leads: leads.map((l) => displayLead(l, req.user)), total: leads.length });
  });
  app.post('/api/leads/check', async (req, res) => {
    let phone;
    try {
      phone = normalizePhone(req.body.phone);
    } catch {
      return res.json({ matches: [] });
    }
    const matches = await duplicates(db, {
      phone,
      email: String(req.body.email ?? '')
        .toLowerCase()
        .trim(),
      business: String(req.body.business ?? ''),
      city: String(req.body.city ?? ''),
    });
    res.json({
      matches: matches.map(({ lead: l, tier }) => ({
        id: l.id,
        business: l.business,
        owner_name: l.owner_name,
        status: l.status,
        last_contact_at: l.last_contact_at,
        tier,
      })),
    });
  });
  app.post('/api/leads', async (req, res) => {
    const lead = cleanLead(req.body);
    const id = await db.tx(async (tx) => {
      const matches = await duplicates(tx, lead);
      if (matches.some((m) => m.tier !== 'business'))
        fail('A lead already exists with this phone number or email.', 409);
      if (matches.length && !req.body.allow_similar)
        fail('A similar business exists in this city. Review it and confirm to continue.', 409);
      const id = await insertLead(tx, lead, req.user.role === 'agent' ? req.user.id : null);
      await audit(tx, req, 'lead_created', id, lead.business);
      return id;
    });
    changed();
    res.status(201).json({ id });
  });
  app.get('/api/leads/:id', async (req, res) => {
    const active = await db.get('SELECT * FROM active_work WHERE user_id=?', [req.user.id]);
    if (req.user.role === 'agent' && active && active.lead_id !== req.params.id)
      fail('Finish the notes for your active lead before opening another.', 409);
    const lead = await getLead(db, req.params.id, req.user);
    const history = await db.all(
      'SELECT c.*,u.name AS agent_name FROM calls c JOIN users u ON u.id=c.user_id WHERE c.lead_id=? ORDER BY c.created_at DESC',
      [lead.id],
    );
    res.json({
      lead: displayLead(lead, req.user, active?.lead_id === lead.id),
      history,
      active: active?.lead_id === lead.id ? active : null,
    });
  });
  app.patch('/api/leads/:id', manager, async (req, res) => {
    const lead = cleanLead(req.body);
    await db.tx(async (tx) => {
      await getLead(tx, req.params.id, req.user);
      if (await tx.get('SELECT lead_id FROM active_work WHERE lead_id=?', [req.params.id]))
        fail('This lead is being worked on. Complete its activity before editing.', 409);
      const matches = await duplicates(tx, lead, req.params.id);
      if (matches.some((m) => m.tier !== 'business'))
        fail('Phone or email is already in use.', 409);
      await tx.run(
        'UPDATE leads SET business=?,contact=?,phone=?,email=?,city=?,category=?,source=?,updated_at=? WHERE id=?',
        [
          lead.business,
          lead.contact,
          lead.phone,
          lead.email,
          lead.city,
          lead.category,
          lead.source,
          now(),
          req.params.id,
        ],
      );
      await audit(tx, req, 'lead_updated', req.params.id);
    });
    changed();
    res.json({ ok: true });
  });
  app.post('/api/leads/:id/reveal', async (req, res) => {
    const result = await db.tx(async (tx) => {
      const lead = await getLead(tx, req.params.id, req.user);
      const active = await tx.get('SELECT * FROM active_work WHERE user_id=?', [req.user.id]);
      if (active && active.lead_id !== lead.id)
        fail('Complete the disposition and notes for your active lead first.', 409);
      const busy = await tx.get('SELECT * FROM active_work WHERE lead_id=?', [lead.id]);
      if (busy && busy.user_id !== req.user.id)
        fail('Another team member is working on this lead.', 409);
      if (!active) {
        await tx.run(
          'INSERT INTO active_work(user_id,lead_id,started_at,previous_status) VALUES(?,?,?,?)',
          [req.user.id, lead.id, now(), lead.status],
        );
        await tx.run('UPDATE leads SET status=?,updated_at=? WHERE id=?', [
          'In Progress',
          now(),
          lead.id,
        ]);
      }
      await audit(
        tx,
        req,
        'contact_revealed',
        lead.id,
        'Contact revealed; mandatory activity log opened.',
      );
      return { phone: lead.phone };
    });
    changed();
    res.json(result);
  });
  app.post('/api/leads/:id/log', async (req, res) => {
    validateDisposition(req.body);
    const minimum = Number(
      (await db.get('SELECT value FROM settings WHERE key=?', ['note_minimum']))?.value ?? 10,
    );
    if (String(req.body.notes).trim().length < minimum)
      fail(`Notes must contain at least ${minimum} characters.`);
    const duration = Number(req.body.duration ?? 0);
    if (!Number.isInteger(duration) || duration < 0 || duration > 86400)
      fail('Duration must be between 0 and 86,400 seconds.');
    await db.tx(async (tx) => {
      const lead = await getLead(tx, req.params.id, req.user);
      const active = await tx.get('SELECT * FROM active_work WHERE user_id=? AND lead_id=?', [
        req.user.id,
        lead.id,
      ]);
      if (!active) fail('Reveal this contact to start a tracked activity first.', 409);
      const date = now(),
        callback =
          req.body.disposition === 'Callback Scheduled'
            ? new Date(req.body.callback_at).toISOString()
            : null;
      await tx.run(
        'INSERT INTO calls(id,lead_id,user_id,disposition,notes,duration,callback_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [
          randomUUID(),
          lead.id,
          req.user.id,
          req.body.disposition,
          String(req.body.notes).trim(),
          duration,
          callback,
          date,
        ],
      );
      await tx.run(
        'UPDATE leads SET status=?,callback_at=?,last_contact_at=?,updated_at=? WHERE id=?',
        [req.body.disposition, callback, date, date, lead.id],
      );
      await tx.run('DELETE FROM active_work WHERE user_id=?', [req.user.id]);
      await audit(tx, req, 'activity_logged', lead.id, req.body.disposition);
    });
    changed();
    res.status(201).json({ ok: true });
  });
  app.post('/api/allocate', manager, async (req, res) => {
    const assigned = await db.tx(async (tx) => {
      let agents;
      if (req.body.agent_id) {
        agents = await tx.all("SELECT id FROM users WHERE id=? AND role='agent' AND active=1", [
          req.body.agent_id,
        ]);
      } else
        agents = await tx.all(
          "SELECT id FROM users WHERE role='agent' AND active=1 AND available=1 ORDER BY id",
        );
      if (!agents.length) fail('No available agents. Add or activate an agent in Team first.');
      let candidates;
      if (Array.isArray(req.body.ids) && req.body.ids.length) {
        if (req.body.ids.length > 1000) fail('Select at most 1,000 leads.');
        candidates = await tx.all(
          `SELECT * FROM leads WHERE id IN (${req.body.ids.map(() => '?').join(',')})`,
          req.body.ids,
        );
      } else {
        const clauses = ['owner_id IS NULL'],
          args = [];
        for (const key of ['category', 'city'])
          if (req.body[key]) {
            clauses.push(`${key}=?`);
            args.push(req.body[key]);
          }
        candidates = await tx.all(
          'SELECT * FROM leads WHERE ' + clauses.join(' AND ') + ' ORDER BY created_at,id',
          args,
        );
      }
      const locked = new Set(
        (await tx.all('SELECT lead_id FROM active_work')).map((w) => w.lead_id),
      );
      if (candidates.some((l) => locked.has(l.id)))
        fail('Selection includes an active lead. Finish its activity before reallocating.', 409);
      const counter = Number(
        (await tx.get("SELECT value FROM settings WHERE key='allocation_cursor'"))?.value ?? 0,
      );
      for (let i = 0; i < candidates.length; i++) {
        const owner = agents[(counter + i) % agents.length].id;
        await tx.run('UPDATE leads SET owner_id=?,updated_at=? WHERE id=?', [
          owner,
          now(),
          candidates[i].id,
        ]);
        await audit(tx, req, 'lead_assigned', candidates[i].id, owner);
      }
      await tx.run(
        "INSERT INTO settings(key,value) VALUES('allocation_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [String(counter + candidates.length)],
      );
      return candidates.length;
    });
    changed();
    res.json({ assigned });
  });
  app.post('/api/work/:userId/release', manager, async (req, res) => {
    if (String(req.body.reason ?? '').trim().length < 10)
      fail('Provide a reason of at least 10 characters.');
    await db.tx(async (tx) => {
      const work = await tx.get('SELECT * FROM active_work WHERE user_id=?', [req.params.userId]);
      if (!work) fail('No active work found.', 404);
      await tx.run('UPDATE leads SET status=?,updated_at=? WHERE id=?', [
        work.previous_status,
        now(),
        work.lead_id,
      ]);
      await tx.run('DELETE FROM active_work WHERE user_id=?', [work.user_id]);
      await audit(tx, req, 'work_released', work.lead_id, req.body.reason);
    });
    changed();
    res.json({ ok: true });
  });
  app.post('/api/imports/preview', manager, upload.single('file'), async (req, res) => {
    if (!req.file || !/\.(csv|xlsx|xls)$/i.test(req.file.originalname))
      fail('Choose a CSV, XLSX, or XLS file.');
    const records = await new Promise((resolvePromise, reject) => {
      const worker = new Worker(new URL('./parse-worker.js', import.meta.url), {
        workerData: { buffer: req.file.buffer, filename: req.file.originalname },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(
          Object.assign(new Error('File parsing timed out. Split the file into smaller batches.'), {
            status: 400,
          }),
        );
      }, 20000);
      worker.once('message', (message) => {
        clearTimeout(timeout);
        worker.terminate();
        message.error
          ? reject(Object.assign(new Error(message.error), { status: 400 }))
          : resolvePromise(message.records);
      });
      worker.once('error', (error) => {
        clearTimeout(timeout);
        reject(Object.assign(error, { status: 400 }));
      });
      worker.once('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0)
          reject(Object.assign(new Error('Could not parse this file.'), { status: 400 }));
      });
    });
    const id = randomUUID(),
      headers = Object.keys(records[0]);
    const aliases = {
      business: [
        'business',
        'businessname',
        'company',
        'companyname',
        'orgname',
        'organization',
        'name',
      ],
      contact: ['contactperson', 'contactname', 'person'],
      phone: ['phone', 'mobile', 'contact', 'phonenumber', 'mobilenumber', 'number'],
      email: ['email', 'emailaddress', 'mail'],
      city: ['city', 'location', 'town'],
      category: ['category', 'industry', 'type'],
      source: ['source', 'leadsource'],
    };
    const mapping = Object.fromEntries(
      Object.entries(aliases).map(([key, names]) => [
        key,
        headers.find((h) => names.includes(h.toLowerCase().replace(/[^a-z]/g, ''))) ?? '',
      ]),
    );
    await db.tx(async (tx) => {
      await tx.run(
        'INSERT INTO imports(id,user_id,filename,rows_json,created_at) VALUES(?,?,?,?,?)',
        [id, req.user.id, req.file.originalname.slice(0, 240), JSON.stringify(records), now()],
      );
      await audit(tx, req, 'import_uploaded', null, `${records.length} rows`);
    });
    res.json({ id, headers, mapping, preview: records.slice(0, 5), total: records.length });
  });
  app.post('/api/imports/:id/commit', manager, async (req, res) => {
    if (!['skip', 'update'].includes(req.body.policy)) fail('Choose a duplicate handling policy.');
    const result = await db.tx(async (tx) => {
      const job = await tx.get('SELECT * FROM imports WHERE id=?', [req.params.id]);
      if (!job) fail('Import not found.', 404);
      if (job.state === 'completed') return JSON.parse(job.result_json);
      const mapping = req.body.mapping ?? {};
      for (const field of ['business', 'phone', 'city'])
        if (!mapping[field]) fail(`Map the ${field} column before importing.`);
      const mapped = Object.values(mapping).filter(Boolean);
      if (new Set(mapped).size !== mapped.length)
        fail('Each source column can only be mapped once.');
      const rows = JSON.parse(job.rows_json),
        result = { inserted: 0, updated: 0, skipped: 0, invalid: 0, issues: [] };
      for (let i = 0; i < rows.length; i++) {
        const raw = Object.fromEntries(
          Object.entries(mapping).map(([key, header]) => [key, rows[i][header] ?? '']),
        );
        let lead;
        try {
          lead = cleanLead(raw);
        } catch (error) {
          result.invalid++;
          result.issues.push({
            row: i + 2,
            business: String(raw.business ?? ''),
            reason: error.message,
          });
          continue;
        }
        const matches = await duplicates(tx, lead);
        if (matches.length) {
          const exact = matches.filter((m) => m.tier !== 'business'),
            ids = new Set(exact.map((m) => m.lead.id));
          if (req.body.policy === 'update' && exact.length && ids.size === 1) {
            const old = exact[0].lead;
            if (await tx.get('SELECT lead_id FROM active_work WHERE lead_id=?', [old.id])) {
              result.skipped++;
              result.issues.push({
                row: i + 2,
                business: lead.business,
                reason: 'Existing lead is currently locked by a team member.',
              });
              continue;
            }
            // Source columns that are absent/blank must never erase existing contact data.
            const values = [
              'business',
              'contact',
              'phone',
              'email',
              'city',
              'category',
              'source',
            ].map((k) => (String(raw[k] ?? '').trim() ? lead[k] : old[k]));
            await tx.run(
              'UPDATE leads SET business=?,contact=?,phone=?,email=?,city=?,category=?,source=?,updated_at=? WHERE id=?',
              [...values, now(), old.id],
            );
            result.updated++;
          } else {
            result.skipped++;
            result.issues.push({
              row: i + 2,
              business: lead.business,
              reason:
                ids.size > 1
                  ? 'Phone and email match different leads; manual review required.'
                  : matches[0].tier === 'business'
                    ? 'Similar business in the same city; review manually.'
                    : `Duplicate ${matches[0].tier}.`,
            });
          }
        } else {
          await insertLead(tx, lead);
          result.inserted++;
        }
      }
      await tx.run("UPDATE imports SET state='completed',result_json=?,rows_json='[]' WHERE id=?", [
        JSON.stringify(result),
        job.id,
      ]);
      await audit(
        tx,
        req,
        'import_completed',
        null,
        `${result.inserted} added; ${result.updated} updated; ${result.skipped} skipped; ${result.invalid} invalid`,
      );
      return result;
    });
    changed();
    res.json(result);
  });
  app.get('/api/imports', manager, async (_req, res) => {
    const jobs = await db.all(
      'SELECT id,filename,state,result_json,created_at FROM imports ORDER BY created_at DESC LIMIT 30',
    );
    res.json(
      jobs.map((j) => ({
        ...j,
        result: j.result_json ? JSON.parse(j.result_json) : null,
        result_json: undefined,
      })),
    );
  });
  app.get('/api/users', manager, async (_req, res) =>
    res.json(
      await db.all(
        'SELECT u.id,u.name,u.email,u.role,u.active,u.available,u.last_seen,u.created_at,w.lead_id AS active_lead,(SELECT COUNT(*) FROM leads WHERE owner_id=u.id) AS lead_count FROM users u LEFT JOIN active_work w ON w.user_id=u.id ORDER BY u.created_at,u.name',
      ),
    ),
  );
  app.post('/api/users', manager, async (req, res) => {
    const name = String(req.body.name ?? '').trim(),
      email = String(req.body.email ?? '')
        .trim()
        .toLowerCase(),
      role = req.body.role ?? 'agent';
    if (!name || name.length > 120 || !/^\S+@\S+\.\S+$/.test(email))
      fail('Enter a name and a valid email address.');
    if (
      !['admin', 'manager', 'agent'].includes(role) ||
      (req.user.role !== 'admin' && role !== 'agent')
    )
      fail('You can only create agent accounts.', 403);
    if (String(req.body.password ?? '').length < 12)
      fail('Temporary password must be at least 12 characters.');
    const id = randomUUID();
    await db.tx(async (tx) => {
      if (await tx.get('SELECT id FROM users WHERE email=?', [email]))
        fail('This email already has an account.', 409);
      await tx.run(
        'INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',
        [id, name, email, passwordHash(req.body.password), role, now()],
      );
      await audit(tx, req, 'user_created', null, email);
    });
    changed();
    res.status(201).json({ id });
  });
  app.patch('/api/users/:id', manager, async (req, res) => {
    await db.tx(async (tx) => {
      const user = await tx.get('SELECT * FROM users WHERE id=?', [req.params.id]);
      if (!user) fail('User not found.', 404);
      if (req.user.role !== 'admin' && user.role !== 'agent')
        fail('Administrator access required.', 403);
      if (user.id === req.user.id && req.body.active === false)
        fail('You cannot deactivate your own account.');
      if (
        req.body.active === false &&
        (await tx.get('SELECT user_id FROM active_work WHERE user_id=?', [user.id]))
      )
        fail('Release this agent’s active work before deactivating the account.', 409);
      if (req.body.password !== undefined && String(req.body.password).length < 12)
        fail('Use a password of at least 12 characters.');
      await tx.run('UPDATE users SET active=?,available=? WHERE id=?', [
        req.body.active === undefined ? user.active : req.body.active ? 1 : 0,
        req.body.available === undefined ? user.available : req.body.available ? 1 : 0,
        user.id,
      ]);
      if (req.body.password !== undefined)
        await tx.run('UPDATE users SET password=? WHERE id=?', [
          passwordHash(req.body.password),
          user.id,
        ]);
      if (req.body.active === false || req.body.password !== undefined)
        await tx.run('DELETE FROM sessions WHERE user_id=?', [user.id]);
      await audit(tx, req, 'user_updated', null, user.email);
    });
    changed();
    res.json({ ok: true });
  });
  app.patch('/api/settings', manager, async (req, res) => {
    const name = String(req.body.company_name ?? '').trim(),
      minimum = Number(req.body.note_minimum);
    if (!name || name.length > 120 || !Number.isInteger(minimum) || minimum < 10 || minimum > 500)
      fail('Provide a company name and a note minimum between 10 and 500.');
    await db.tx(async (tx) => {
      for (const [key, value] of [
        ['company_name', name],
        ['note_minimum', String(minimum)],
      ])
        await tx.run(
          'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
          [key, value],
        );
      await audit(tx, req, 'settings_updated');
    });
    changed();
    res.json({ ok: true });
  });
  app.get('/api/audit', manager, async (req, res) => {
    const where = [],
      args = [];
    for (const key of ['user_id', 'action'])
      if (req.query[key]) {
        where.push(`a.${key}=?`);
        args.push(req.query[key]);
      }
    const page = Math.max(1, parseInt(req.query.page) || 1),
      clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const count = await db.get('SELECT COUNT(*) AS count FROM audit a' + clause, args);
    const rows = await db.all(
      'SELECT a.*,u.name AS user_name,l.business FROM audit a JOIN users u ON u.id=a.user_id LEFT JOIN leads l ON l.id=a.lead_id' +
        clause +
        ' ORDER BY a.created_at DESC LIMIT 30 OFFSET ?',
      [...args, (page - 1) * 30],
    );
    res.json({ rows, total: Number(count.count), page });
  });
  async function reportData(req) {
    const f = leadFilter(req);
    // Lead creation dates filter lead reports; analytics date range filters activity timestamps.
    const allLeads = await db.all(
      'SELECT l.*,u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id' + f.sql,
      f.args,
    );
    const clauses = [],
      args = [];
    if (req.user.role === 'agent') {
      clauses.push('c.user_id=?');
      args.push(req.user.id);
    } else if (req.query.owner === 'unassigned') {
      clauses.push('l.owner_id IS NULL');
    } else if (req.query.owner) {
      clauses.push('c.user_id=?');
      args.push(req.query.owner);
    }
    for (const key of ['category', 'city'])
      if (req.query[key]) {
        clauses.push(`l.${key}=?`);
        args.push(req.query[key]);
      }
    if (req.query.status) {
      clauses.push('c.disposition=?');
      args.push(req.query.status);
    }
    if (req.query.from) {
      clauses.push('c.created_at>=?');
      args.push(req.query.from);
    }
    if (req.query.to) {
      clauses.push('c.created_at<=?');
      args.push(req.query.to + 'T23:59:59.999Z');
    }
    const calls = await db.all(
      'SELECT c.*,l.business,l.category,l.city,u.name AS agent_name FROM calls c JOIN leads l ON l.id=c.lead_id JOIN users u ON u.id=c.user_id' +
        (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') +
        ' ORDER BY c.created_at DESC',
      args,
    );
    return { leads: allLeads, calls };
  }
  app.get('/api/reports', async (req, res) => {
    const data = await reportData(req);
    res.json({ calls: data.calls.slice(0, 1000), total: data.calls.length });
  });
  app.get('/api/analytics', async (req, res) => {
    const { leads, calls } = await reportData(req);
    const connected = calls.filter((c) =>
      ['Interested', 'Callback Scheduled', 'Closed Won'].includes(c.disposition),
    );
    const won = new Set(calls.filter((c) => c.disposition === 'Closed Won').map((c) => c.lead_id))
      .size;
    const agents = await db.all(
      "SELECT id,name FROM users WHERE role='agent'" +
        (req.user.role === 'agent' ? ' AND id=?' : ''),
      req.user.role === 'agent' ? [req.user.id] : [],
    );
    const leaderboard = agents
      .map((a) => {
        const records = calls.filter((c) => c.user_id === a.id),
          connections = records.filter((c) =>
            ['Interested', 'Callback Scheduled', 'Closed Won'].includes(c.disposition),
          ).length;
        return {
          ...a,
          calls: records.length,
          connected: connections,
          rate: records.length ? Math.round((connections / records.length) * 100) : 0,
          duration: records.reduce((s, c) => s + c.duration, 0),
          won: new Set(records.filter((c) => c.disposition === 'Closed Won').map((c) => c.lead_id))
            .size,
        };
      })
      .sort((a, b) => b.won - a.won || b.calls - a.calls);
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
      const records = calls.filter((c) => c.created_at.startsWith(date));
      return {
        date,
        attempts: records.length,
        connected: records.filter((c) =>
          ['Interested', 'Callback Scheduled', 'Closed Won'].includes(c.disposition),
        ).length,
      };
    });
    const categories = [...new Set(leads.map((l) => l.category))].map((name) => {
      const records = leads.filter((l) => l.category === name);
      return {
        name,
        total: records.length,
        won: records.filter((l) => l.status === 'Closed Won').length,
      };
    });
    const sources = [...new Set(leads.map((l) => l.source))].map((name) => {
      const records = leads.filter((l) => l.source === name);
      return {
        name,
        total: records.length,
        won: records.filter((l) => l.status === 'Closed Won').length,
      };
    });
    const callbacks = leads
      .filter((l) => l.callback_at && l.status === 'Callback Scheduled')
      .sort((a, b) => a.callback_at.localeCompare(b.callback_at));
    res.json({
      total: leads.length,
      unassigned: leads.filter((l) => !l.owner_id).length,
      attempts: calls.length,
      connected: connected.length,
      connectRate: calls.length ? Math.round((connected.length / calls.length) * 100) : 0,
      won,
      conversion: calls.length
        ? Math.round((won / new Set(calls.map((c) => c.lead_id)).size) * 100)
        : 0,
      duration: calls.reduce((s, c) => s + c.duration, 0),
      leaderboard,
      days,
      categories,
      sources,
      pipeline: ['Pending', 'In Progress', ...STATUSES.filter((s) => s !== 'Pending')].map(
        (status) => ({ status, count: leads.filter((l) => l.status === status).length }),
      ),
      callbacks: callbacks.slice(0, 8).map((l) => displayLead(l, req.user)),
      callbackCount: callbacks.length,
      overdue: callbacks.filter((l) => l.callback_at < now()).length,
      recent: calls.slice(0, 6),
    });
  });
  app.get('/api/export', async (req, res) => {
    const type = req.query.type ?? 'leads',
      format = req.query.format ?? 'csv';
    if (!['leads', 'calls', 'audit'].includes(type) || !['csv', 'xlsx'].includes(format))
      fail('Unsupported export.');
    let rows;
    if (type === 'audit') {
      if (req.user.role === 'agent') fail('Manager access required.', 403);
      rows = await db.all(
        'SELECT a.created_at,u.name AS agent,a.action,l.business,a.detail,a.ip FROM audit a JOIN users u ON u.id=a.user_id LEFT JOIN leads l ON l.id=a.lead_id ORDER BY a.created_at DESC',
      );
    } else {
      const data = await reportData(req);
      rows =
        type === 'calls'
          ? data.calls.map((c) => ({
              business: c.business,
              agent: c.agent_name,
              disposition: c.disposition,
              notes: c.notes,
              duration_seconds: c.duration,
              callback_at: c.callback_at,
              created_at: c.created_at,
            }))
          : data.leads.map((l) => ({
              business: l.business,
              contact: l.contact,
              phone: req.user.role === 'agent' ? maskPhone(l.phone) : l.phone,
              email: l.email,
              city: l.city,
              category: l.category,
              source: l.source,
              status: l.status,
              owner: l.owner_name,
              callback_at: l.callback_at,
              created_at: l.created_at,
            }));
    }
    rows = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safeCell(v)])),
    );
    await db.tx((tx) =>
      audit(tx, req, 'data_exported', null, `${type}: ${rows.length} rows as ${format}`),
    );
    res.set(
      'Content-Disposition',
      `attachment; filename="relay-${type}-${now().slice(0, 10)}.${format}"`,
    );
    if (format === 'csv') {
      res.type('text/csv').send('\uFEFF' + Papa.unparse(rows));
    } else {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), type);
      res
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'Maximum file size is 5 MB.' });
    if (error.code === '23505' || String(error.message).includes('UNIQUE constraint'))
      return res.status(409).json({ error: 'A record with these details already exists.' });
    const status = error.status ?? (error instanceof multer.MulterError ? 400 : 500);
    if (status >= 500) console.error(error);
    res
      .status(status)
      .json({ error: status >= 500 ? 'Something went wrong. Please try again.' : error.message });
  });
  app.locals.closeStreams = () => {
    for (const stream of streams) stream.end();
  };
  return app;
}
