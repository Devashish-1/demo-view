import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from '../db.js';
import { createApp } from '../app.js';
import { passwordHash } from '../domain.js';
import { bootstrapPlatform } from './templates.js';
import { fail, name, stamp } from './domain.js';
import { runJobs } from './automation.js';

export async function createOrganizationHost(root, options = {}) {
  await root.run(
    `CREATE TABLE IF NOT EXISTS relay_organizations(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,namespace TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`,
  );
  await root.run(
    `CREATE TABLE IF NOT EXISTS relay_session_directory(token TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES relay_organizations(id),expires_at TEXT NOT NULL)`,
  );
  await root.run(
    'INSERT INTO relay_organizations(id,slug,name,namespace,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    ['default', 'default', 'Relay Logistics', '', stamp()],
  );
  const cache = new Map(),
    databases = new Map([['default', root]]);
  async function provision(input, user) {
    if (user.role !== 'admin') fail('Administrator access required.', 403);
    const title = name(input.name, 'Organization name'),
      slug = String(input.slug ?? '')
        .trim()
        .toLowerCase();
    if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug))
      fail('Organization code must be 3–41 lowercase letters, digits or hyphens.');
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? '') ||
      String(input.password ?? '').length < 12
    )
      fail('Enter an administrator email and password of at least 12 characters.');
    const id = randomUUID(),
      namespace = 'org_' + id.replaceAll('-', '');
    if (await root.get('SELECT id FROM relay_organizations WHERE slug=?', [slug]))
      fail('Organization code is already in use.', 409);
    const db = await createDatabase({ ...options, namespace });
    try {
      await db.tx(async (tx) => {
        await tx.run(
          'INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',
          [
            randomUUID(),
            name(input.admin_name ?? 'Workspace Admin'),
            input.email.toLowerCase().trim(),
            passwordHash(input.password),
            'admin',
            stamp(),
          ],
        );
        await tx.run('INSERT INTO settings(key,value) VALUES(?,?)', ['company_name', title]);
        await tx.run('INSERT INTO settings(key,value) VALUES(?,?)', ['note_minimum', '10']);
      });
      await bootstrapPlatform(db);
      await root.run(
        'INSERT INTO relay_organizations(id,slug,name,namespace,created_at) VALUES(?,?,?,?,?)',
        [id, slug, title, namespace, stamp()],
      );
      databases.set(id, db);
      return { id, slug, name: title };
    } catch (error) {
      await db.close();
      throw error;
    }
  }
  async function application(org) {
    if (!cache.has(org.id))
      cache.set(
        org.id,
        (async () => {
          let db = databases.get(org.id);
          if (!db) {
            db = await createDatabase({ ...options, namespace: org.namespace });
            databases.set(org.id, db);
          }
          await bootstrapPlatform(db);
          return createApp(db, {
            organization: { id: org.id, name: org.name, slug: org.slug },
            scheduleJobs: options.defer
              ? () =>
                  options.defer(
                    runJobs(db, 20).catch((error) =>
                      console.error('Automation worker failed:', error.message),
                    ),
                  )
              : undefined,
            provisionOrganization: provision,
            onSession: async (token, expires) =>
              root.run(
                'INSERT INTO relay_session_directory(token,organization_id,expires_at) VALUES(?,?,?) ON CONFLICT(token) DO UPDATE SET expires_at=excluded.expires_at',
                [token, org.id, expires],
              ),
          });
        })().catch((error) => {
          cache.delete(org.id);
          throw error;
        }),
      );
    return cache.get(org.id);
  }
  const host = express();
  host.disable('x-powered-by');
  if (process.env.TRUST_PROXY) host.set('trust proxy', process.env.TRUST_PROXY);
  host.use(express.json({ limit: '1mb' }), cookieParser());
  host.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 900000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many sign-in attempts. Please try again later.' },
    }),
  );
  host.use(async (req, res, next) => {
    try {
      let org;
      if (req.path === '/api/auth/login' && req.method === 'POST') {
        const slug =
          String(req.body?.organization ?? 'default')
            .toLowerCase()
            .trim() || 'default';
        org = await root.get('SELECT * FROM relay_organizations WHERE slug=?', [slug]);
        if (!org)
          return res.status(401).json({ error: 'Email, password or organization is incorrect.' });
      } else {
        const token = req.cookies.relay_session;
        const session =
          token &&
          (await root.get(
            'SELECT organization_id FROM relay_session_directory WHERE token=? AND expires_at>?',
            [createHash('sha256').update(token).digest('hex'), stamp()],
          ));
        org = await root.get('SELECT * FROM relay_organizations WHERE id=?', [
          session?.organization_id ?? 'default',
        ]);
      }
      // The tenant is selected by a server-created session mapping. Query/header IDs are ignored.
      const app = await application(org);
      return app(req, res, next);
    } catch (error) {
      next(error);
    }
  });
  host.use((error, req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Workspace could not be loaded.' });
  });
  host.locals.processJobs = async () => {
    const organizations = await root.all('SELECT * FROM relay_organizations ORDER BY created_at');
    let processed = 0;
    for (const org of organizations) {
      await application(org);
      processed += (await runJobs(databases.get(org.id), 20)).processed;
    }
    return { processed };
  };
  host.locals.closeStreams = () => {
    for (const app of cache.values()) app.then((a) => a.locals.closeStreams()).catch(() => {});
  };
  host.locals.closeTenants = async () => {
    for (const [id, db] of databases) if (id !== 'default') await db.close();
  };
  return host;
}
