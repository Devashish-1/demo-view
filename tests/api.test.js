import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createDatabase } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';
import { createApp } from '../server/app.js';

let db, app, server, base, admin, agent, second, manager, agentId, secondId;
const lead = (suffix, extra = {}) => ({
  business: `Distinct Company ${suffix}`,
  phone: `987650${String(suffix).padStart(4, '0')}`,
  city: 'Pune',
  category: 'Logistics',
  source: 'Tests',
  ...extra,
});
async function request(path, { method = 'GET', body, auth = admin, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  return { status: response.status, data, response };
}
async function login(email, password = 'testing-password-123') {
  const result = await request('/auth/login', {
    method: 'POST',
    auth: null,
    body: { email, password },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return {
    cookie: result.response.headers.get('set-cookie').split(';')[0],
    csrf: result.data.csrf,
  };
}
async function createLead(input) {
  const result = await request('/leads', { method: 'POST', body: input });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.id;
}
async function assign(id, owner = agentId) {
  const result = await request('/allocate', {
    method: 'POST',
    body: { ids: [id], agent_id: owner },
  });
  assert.equal(result.status, 200);
}
async function importFile(content, filename = 'leads.csv') {
  const body = new FormData();
  body.append('file', new Blob([content]), filename);
  const result = await request('/imports/preview', { method: 'POST', body });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
before(async () => {
  process.env.SEED_DEMO = 'false';
  process.env.SEED_ADMIN_PASSWORD = 'testing-password-123';
  db = await createDatabase({ path: ':memory:', url: '' });
  await seedDatabase(db);
  app = createApp(db);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = await login('admin@gmail.com');
  const add = async (name, email, role = 'agent') => {
    const r = await request('/users', {
      method: 'POST',
      body: { name, email, role, password: 'testing-password-123' },
    });
    assert.equal(r.status, 201);
    return r.data.id;
  };
  agentId = await add('Agent One', 'one@example.com');
  secondId = await add('Agent Two', 'two@example.com');
  await add('Manager', 'manager@example.com', 'manager');
  agent = await login('one@example.com');
  second = await login('two@example.com');
  manager = await login('manager@example.com');
});
after(async () => {
  app.locals.closeStreams();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

test('authentication, role checks, CSRF and origin checks are enforced by the API', async () => {
  assert.equal((await request('/leads', { auth: null })).status, 401);
  assert.equal(
    (
      await request('/auth/login', {
        method: 'POST',
        auth: null,
        body: { email: 'admin@gmail.com', password: 'wrong' },
      })
    ).status,
    401,
  );
  assert.equal((await request('/users', { auth: agent })).status, 403);
  assert.equal(
    (
      await request('/settings', {
        method: 'PATCH',
        body: {},
        headers: { 'X-CSRF-Token': 'wrong' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/leads', {
        method: 'POST',
        body: lead(1),
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
});
test('canonical phone and email matches are hard blocked; fuzzy businesses require explicit review', async () => {
  await createLead(lead(1, { business: 'Horizon Trading', email: 'CONTACT@EXAMPLE.COM' }));
  assert.equal(
    (await request('/leads', { method: 'POST', body: lead(2, { phone: '+91 9876500001' }) }))
      .status,
    409,
  );
  assert.equal(
    (await request('/leads', { method: 'POST', body: lead(2, { email: 'contact@example.com' }) }))
      .status,
    409,
  );
  assert.equal(
    (await request('/leads', { method: 'POST', body: lead(2, { business: 'Horizons Trading' }) }))
      .status,
    409,
  );
  assert.equal(
    (
      await request('/leads', {
        method: 'POST',
        body: lead(2, { business: 'Horizons Trading', allow_similar: true }),
      })
    ).status,
    201,
  );
  const check = await request('/leads/check', {
    method: 'POST',
    auth: agent,
    body: { phone: '9876500001' },
  });
  assert.equal(check.data.matches[0].tier, 'phone');
  assert.equal(check.data.matches[0].phone, undefined);
});
test('agents only receive owned leads and masked phone numbers', async () => {
  const id = await createLead(lead(10, { business: 'Ocean Cargo' }));
  await assign(id);
  const list = await request('/leads', { auth: agent });
  assert.equal(list.data.total, 1);
  assert.equal(list.data.leads[0].phone, '98765•••••');
  assert.equal((await request('/leads/' + id, { auth: second })).status, 403);
  const detail = await request('/leads/' + id, { auth: agent });
  assert.equal(detail.data.lead.phone, '98765•••••');
});
test('reveal locks progression across sessions, requires valid notes, and records an immutable audit event', async () => {
  const a = await createLead(lead(20, { business: 'Cedar Supply' })),
    b = await createLead(lead(21, { business: 'Sunrise Care' }));
  await assign(a);
  await assign(b);
  const reveal = await request(`/leads/${a}/reveal`, { method: 'POST', auth: agent });
  assert.equal(reveal.status, 200);
  assert.equal(reveal.data.phone, '9876500020');
  assert.equal((await request(`/leads/${b}`, { auth: agent })).status, 409);
  assert.equal((await request(`/leads/${b}/reveal`, { method: 'POST', auth: agent })).status, 409);
  assert.equal(
    (await request('/allocate', { method: 'POST', body: { ids: [a], agent_id: secondId } })).status,
    409,
  );
  await request('/auth/logout', { method: 'POST', auth: agent });
  agent = await login('one@example.com');
  assert.equal((await request('/meta', { auth: agent })).data.active.lead_id, a);
  assert.equal(
    (
      await request(`/leads/${a}/log`, {
        method: 'POST',
        auth: agent,
        body: { disposition: 'Interested', notes: 'short' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/leads/${a}/log`, {
        method: 'POST',
        auth: agent,
        body: { disposition: 'Callback Scheduled', notes: 'Please call next week.' },
      })
    ).status,
    400,
  );
  const callback = new Date(Date.now() + 86400000).toISOString();
  assert.equal(
    (
      await request(`/leads/${a}/log`, {
        method: 'POST',
        auth: agent,
        body: {
          disposition: 'Callback Scheduled',
          notes: 'Discuss the proposal tomorrow.',
          callback_at: callback,
          duration: 121,
        },
      })
    ).status,
    201,
  );
  assert.equal((await request('/meta', { auth: agent })).data.active, null);
  const history = (await request('/leads/' + a, { auth: agent })).data;
  assert.equal(history.history.length, 1);
  assert.equal(history.lead.phone, '98765•••••');
  const callbacks = (await request('/callbacks', { auth: agent })).data;
  assert.ok(callbacks.leads.some((l) => l.id === a));
  const audit = await db.get("SELECT * FROM audit WHERE action='contact_revealed' AND lead_id=?", [
    a,
  ]);
  assert.equal(audit.user_id, agentId);
  assert.ok(audit.ip);
  assert.ok(audit.created_at.endsWith('Z'));
  await assert.rejects(
    () => db.run('UPDATE audit SET detail=? WHERE id=?', ['tampered', audit.id]),
    /immutable/,
  );
  await assert.rejects(() => db.run('DELETE FROM audit WHERE id=?', [audit.id]), /immutable/);
});
test('concurrent contact reveals only allow one open activity', async () => {
  const a = await createLead(lead(30, { business: 'Emerald Power' })),
    b = await createLead(lead(31, { business: 'Vertex Tools' }));
  await assign(a, secondId);
  await assign(b, secondId);
  const results = await Promise.all(
    [a, b].map((id) => request(`/leads/${id}/reveal`, { method: 'POST', auth: second })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const active = (await request('/meta', { auth: second })).data.active;
  assert.equal(
    (
      await request('/work/' + secondId + '/release', {
        method: 'POST',
        body: { reason: 'Agent session interrupted; manager reviewed activity.' },
      })
    ).status,
    200,
  );
  assert.equal((await request('/leads/' + active.lead_id)).data.lead.status, 'Pending');
});
test('CSV imports auto-map headers, skip in-file duplicates, report invalid records, and are idempotent', async () => {
  const preview = await importFile(
    'Org Name,Mobile,City,Email\nBlue Whales Freight,+91 9876500100,Delhi,blue@example.com\nBlue Whales Freight,9876500100,Delhi,blue@example.com\nBad Record,123,Delhi,\n',
  );
  assert.equal(preview.mapping.business, 'Org Name');
  assert.equal(preview.mapping.phone, 'Mobile');
  const result = await request(`/imports/${preview.id}/commit`, {
    method: 'POST',
    body: { mapping: preview.mapping, policy: 'skip' },
  });
  assert.equal(result.status, 200);
  assert.deepEqual([result.data.inserted, result.data.skipped, result.data.invalid], [1, 1, 1]);
  const second = await request(`/imports/${preview.id}/commit`, {
    method: 'POST',
    body: { mapping: preview.mapping, policy: 'skip' },
  });
  assert.deepEqual(second.data, result.data);
});
test('XLSX and legacy XLS parsing work in an isolated worker', async () => {
  for (const extension of ['xlsx', 'xls']) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet([
        { Business: 'Workbook Lead', Phone: '9876500110', City: 'Mumbai' },
      ]),
      'Leads',
    );
    const preview = await importFile(
      XLSX.write(book, { type: 'buffer', bookType: extension === 'xls' ? 'biff8' : 'xlsx' }),
      `workbook.${extension}`,
    );
    assert.equal(preview.total, 1);
    assert.equal(preview.preview[0].Phone, '9876500110');
  }
});
test('updating duplicate imports preserves history, ownership and blank fields', async () => {
  const id = await createLead(
    lead(120, {
      business: 'Crystal Commerce',
      contact: 'Original Person',
      email: 'original@example.com',
    }),
  );
  await assign(id);
  await request(`/leads/${id}/reveal`, { method: 'POST', auth: agent });
  await request(`/leads/${id}/log`, {
    method: 'POST',
    auth: agent,
    body: { disposition: 'Interested', notes: 'Keep this historical conversation.', duration: 60 },
  });
  const preview = await importFile(
    'Business,Mobile,City,Email\nCrystal Commerce,9876500120,Mumbai,\n',
  );
  const result = await request(`/imports/${preview.id}/commit`, {
    method: 'POST',
    body: { mapping: preview.mapping, policy: 'update' },
  });
  assert.equal(result.data.updated, 1);
  const detail = (await request('/leads/' + id)).data;
  assert.equal(detail.lead.city, 'Mumbai');
  assert.equal(detail.lead.contact, 'Original Person');
  assert.equal(detail.lead.email, 'original@example.com');
  assert.equal(detail.lead.owner_id, agentId);
  assert.equal(detail.history.length, 1);
  assert.equal(detail.lead.status, 'Interested');
});
test('ambiguous phone/email collisions are held for manual review', async () => {
  await createLead(lead(130, { business: 'Amber Freight', email: 'amber@example.com' }));
  await createLead(lead(131, { business: 'Ruby Electric', email: 'ruby@example.com' }));
  const preview = await importFile(
    'Business,Mobile,City,Email\nAmber Freight,9876500130,Pune,ruby@example.com\n',
  );
  const result = await request(`/imports/${preview.id}/commit`, {
    method: 'POST',
    body: { mapping: preview.mapping, policy: 'update' },
  });
  assert.equal(result.data.skipped, 1);
  assert.match(result.data.issues[0].reason, /different leads/);
});
test('round-robin assigns each unowned lead once and refuses agent allocation requests', async () => {
  assert.equal((await request('/allocate', { method: 'POST', auth: agent, body: {} })).status, 403);
  const result = await request('/allocate', { method: 'POST', body: {} });
  assert.ok(result.data.assigned > 0);
  assert.equal((await request('/allocate', { method: 'POST', body: {} })).data.assigned, 0);
  assert.equal(
    Number((await db.get('SELECT COUNT(*) AS count FROM leads WHERE owner_id IS NULL')).count),
    0,
  );
});
test('report filters, personal analytics and spreadsheet exports respect access scope', async () => {
  const analytics = (await request('/analytics', { auth: agent })).data;
  assert.equal(analytics.leaderboard.length, 1);
  assert.equal(analytics.leaderboard[0].id, agentId);
  assert.ok(analytics.attempts >= 2);
  const csv = await request('/export?type=leads&format=csv', { auth: agent });
  assert.equal(csv.status, 200);
  assert.ok(csv.data.includes('•••••'));
  assert.ok(!csv.data.includes('9876500020'));
  const xlsx = await fetch(base + '/export?type=calls&format=xlsx', {
    headers: { Cookie: admin.cookie },
  });
  assert.equal(xlsx.status, 200);
  const book = XLSX.read(await xlsx.arrayBuffer());
  assert.ok(book.SheetNames.includes('calls'));
  assert.equal((await request('/export?type=audit', { auth: agent })).status, 403);
  assert.equal((await request('/reports?from=2099-01-01')).data.total, 0);
});
test('settings enforce note minimum on the server and manager cannot grant elevated roles', async () => {
  assert.equal(
    (
      await request('/users', {
        method: 'POST',
        auth: manager,
        body: {
          name: 'Illegal Admin',
          email: 'illegal@example.com',
          role: 'admin',
          password: 'long-enough-password',
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/settings', {
        method: 'PATCH',
        body: { company_name: 'Test Company', note_minimum: 30 },
      })
    ).status,
    200,
  );
  const id = await createLead(lead(140, { business: 'Marigold Manufacturers' }));
  await assign(id);
  await request(`/leads/${id}/reveal`, { method: 'POST', auth: agent });
  assert.equal(
    (
      await request(`/leads/${id}/log`, {
        method: 'POST',
        auth: agent,
        body: { disposition: 'Interested', notes: 'Ten or more characters.' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/leads/${id}/log`, {
        method: 'POST',
        auth: agent,
        body: {
          disposition: 'Closed Won',
          notes: 'The client approved the proposal and completed the onboarding process.',
        },
      })
    ).status,
    201,
  );
});
test('deactivation invalidates sessions and personal password changes verify the current password', async () => {
  assert.equal(
    (
      await request('/auth/password', {
        method: 'POST',
        auth: second,
        body: { current: 'wrong', password: 'new-secure-password' },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/users/' + secondId, { method: 'PATCH', body: { active: false } })).status,
    200,
  );
  assert.equal((await request('/leads', { auth: second })).status, 401);
  assert.equal(
    (await request('/users/admin', { method: 'PATCH', body: { active: false } })).status,
    400,
  );
});
test('transaction failures roll back all writes', async () => {
  await assert.rejects(() =>
    db.tx(async (tx) => {
      await tx.run("INSERT INTO settings(key,value) VALUES('rollback-test','value')");
      throw new Error('intentional failure');
    }),
  );
  assert.equal(await db.get("SELECT * FROM settings WHERE key='rollback-test'"), undefined);
});
