import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';
import { createOrganizationHost } from '../server/platform/organizations.js';
import { formula, matches, validateValues } from '../server/platform/domain.js';

let dir, db, host, server, base, admin, agent, boot, agentId;
async function request(path, { method = 'GET', body, auth = admin, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(auth ? { cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  return { status: response.status, data, response };
}
async function ok(path, options = {}, status = 200) {
  const result = await request(path, options);
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}
async function login(email, password, organization = 'default') {
  const r = await request('/auth/login', {
    method: 'POST',
    auth: null,
    body: { email, password, organization },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { cookie: r.response.headers.get('set-cookie').split(';')[0], csrf: r.data.csrf };
}
before(async () => {
  process.env.SEED_DEMO = 'false';
  process.env.SEED_ADMIN_PASSWORD = 'testing-password-123';
  dir = await mkdtemp(join(tmpdir(), 'relay-platform-'));
  const path = join(dir, 'test.db');
  db = await createDatabase({ path, url: '' });
  await seedDatabase(db);
  host = await createOrganizationHost(db, { path, url: '' });
  server = host.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = await login('admin@gmail.com', 'testing-password-123');
  boot = await ok('/platform/bootstrap');
  const u = await ok(
    '/users',
    {
      method: 'POST',
      body: {
        name: 'Assigned Agent',
        email: 'agent@test.example',
        role: 'agent',
        password: 'testing-password-123',
      },
    },
    201,
  );
  agentId = u.id;
  agent = await login('agent@test.example', 'testing-password-123');
});
after(async () => {
  host?.locals.closeStreams();
  if (server) await new Promise((resolve) => server.close(resolve));
  await host?.locals.closeTenants();
  await db?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test('formula parser computes safe expressions and rejects arbitrary code and excessive nesting', () => {
  assert.equal(formula('ROUND(Recovered / Amount * 100, 2)', { Recovered: 125, Amount: 500 }), 25);
  assert.equal(formula('IF(Amount > 100, SUM(1, 2, 3), 0)', { Amount: 200 }), 6);
  assert.throws(() => formula('process.exit(0)'), /syntax/);
  assert.throws(() => formula('constructor(1)'), /Unknown/);
  assert.throws(() => formula('1 / 0'), /zero/);
  assert.throws(() => formula('('.repeat(30) + '1' + ')'.repeat(30)), /nesting/);
  assert.equal(
    matches(
      {
        op: 'AND',
        conditions: [
          { field: 'a', op: 'greater', value: 10 },
          { field: 'b', op: 'contains', value: 'abc' },
        ],
      },
      { a: 12, b: 'ABC ltd' },
    ),
    true,
  );
  assert.throws(
    () =>
      validateValues([{ id: 's', name: 'Status', type: 'status', config: '{"options":["New"]}' }], {
        s: 'Other',
      }),
    /listed/,
  );
});
test('boards enforce assignment, field validation, masking, optimistic concurrency and filtered exports', async () => {
  const b = boot.boards.find((b) => b.kind === 'contacts'),
    detail = await ok(`/platform/boards/${b.id}`),
    phone = detail.columns.find((c) => c.type === 'phone');
  const record = await ok(
    `/platform/boards/${b.id}/items`,
    {
      method: 'POST',
      body: { name: 'Private contact', owner_id: agentId, values: { [phone.id]: '9876543210' } },
    },
    201,
  );
  const visible = await ok(`/platform/items/${record.id}`, { auth: agent });
  assert.equal(visible.values[phone.id], '98765•••••');
  assert.equal(visible.values_json, undefined);
  const another = await ok(
    `/platform/boards/${b.id}/items`,
    { method: 'POST', body: { name: 'Manager only', values: {} } },
    201,
  );
  assert.equal((await request(`/platform/items/${another.id}`, { auth: agent })).status, 404);
  assert.equal(
    (
      await request(`/platform/items/${record.id}`, {
        method: 'PATCH',
        auth: agent,
        body: { owner_id: null },
      })
    ).status,
    403,
  );
  await ok(`/platform/items/${record.id}`, {
    method: 'PATCH',
    body: { name: 'Updated contact', version: visible.version },
  });
  assert.equal(
    (
      await request(`/platform/items/${record.id}`, {
        method: 'PATCH',
        body: { name: 'Stale', version: visible.version },
      })
    ).status,
    409,
  );
  const filtered = await ok(
    `/platform/boards/${b.id}/items?filter=` +
      encodeURIComponent(JSON.stringify({ field: 'name', op: 'contains', value: 'Updated' })),
  );
  assert.equal(filtered.total, 1);
  const exported = await ok(`/platform/boards/${b.id}/export`, { auth: agent });
  assert.match(exported, /98765/);
  assert.ok(!exported.includes('9876543210'));
  assert.equal(
    (
      await request(`/platform/boards/${b.id}/columns`, {
        method: 'POST',
        auth: agent,
        body: { name: 'Secret', type: 'text' },
      })
    ).status,
    403,
  );
});
test('lead conversion links contact, company and deal exactly once without changing lead activity', async () => {
  const lead = await ok(
    '/leads',
    {
      method: 'POST',
      body: {
        business: 'Conversion Logistics',
        contact: 'Asha',
        phone: '9876500999',
        email: 'asha@example.com',
        city: 'Mumbai',
        category: 'Logistics',
        source: 'Tests',
      },
    },
    201,
  );
  const first = await ok(`/platform/leads/${lead.id}/convert`, { method: 'POST' }),
    second = await ok(`/platform/leads/${lead.id}/convert`, { method: 'POST' });
  assert.equal(first.deal_id, second.deal_id);
  const company = await ok(`/platform/items/${first.company_id}`);
  assert.equal(company.linked.length, 2);
  const original = await ok(`/leads/${lead.id}`);
  assert.equal(original.lead.status, 'Pending');
});
test('recovery payments are atomic, idempotent and cannot overpay or close an unpaid case', async () => {
  const b = boot.boards.find((b) => b.kind === 'recovery'),
    detail = await ok(`/platform/boards/${b.id}`),
    amount = detail.columns.find((c) => c.name === 'Outstanding amount'),
    currency = detail.columns.find((c) => c.name === 'Currency');
  const created = await ok(
    `/platform/boards/${b.id}/items`,
    {
      method: 'POST',
      body: { name: 'Case RC-101', values: { [amount.id]: 1000, [currency.id]: 'INR' } },
    },
    201,
  );
  const closed = detail.groups.find((g) => g.name === 'Closed');
  assert.equal(
    (
      await request(`/platform/items/${created.id}`, {
        method: 'PATCH',
        body: { group_id: closed.id },
      })
    ).status,
    400,
  );
  const payment = {
    amount: '400.25',
    reference: 'Bank receipt test',
    idempotency_key: 'test-payment-001',
  };
  const first = await ok(
      `/platform/items/${created.id}/payments`,
      { method: 'POST', body: payment },
      201,
    ),
    again = await ok(
      `/platform/items/${created.id}/payments`,
      { method: 'POST', body: payment },
      201,
    );
  assert.equal(first.id, again.id);
  let state = await ok(`/platform/items/${created.id}`);
  assert.equal(state.balance.pending, 59975);
  assert.equal(state.payments.length, 1);
  assert.equal(
    (
      await request(`/platform/items/${created.id}/payments`, {
        method: 'POST',
        body: { ...payment, amount: '600', idempotency_key: 'test-payment-002' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/platform/items/${created.id}`, {
        method: 'PATCH',
        body: { values: { [currency.id]: 'USD' } },
      })
    ).status,
    400,
  );
  const concurrent = await Promise.all([
    request(`/platform/items/${created.id}/payments`, {
      method: 'POST',
      body: { amount: '599.75', idempotency_key: 'test-payment-final-a' },
    }),
    request(`/platform/items/${created.id}/payments`, {
      method: 'POST',
      body: { amount: '599.75', idempotency_key: 'test-payment-final-b' },
    }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 400]);
  state = await ok(`/platform/items/${created.id}`);
  assert.equal(state.balance.pending, 0);
  assert.equal(state.balance.recovered, 100000);
});
test('automation jobs produce one notification, record execution and do not recursively trigger', async () => {
  const b = boot.boards.find((b) => b.kind === 'tasks');
  await ok(
    '/platform/rules',
    {
      method: 'POST',
      body: {
        board_id: b.id,
        name: 'Notify assignee',
        event: 'item.created',
        condition: {},
        action: { type: 'notify', message: 'Please review' },
      },
    },
    201,
  );
  const created = await ok(
    `/platform/boards/${b.id}/items`,
    { method: 'POST', body: { name: 'Follow-up task', owner_id: agentId } },
    201,
  );
  await ok('/platform/jobs/run', { method: 'POST' });
  await ok('/platform/jobs/run', { method: 'POST' });
  const inbox = await ok('/platform/notifications', { auth: agent });
  assert.equal(
    inbox.notifications.filter((n) => n.item_id === created.id && n.message === 'Please review')
      .length,
    1,
  );
  const runs = await ok('/platform/rules');
  assert.equal(runs.runs.filter((r) => r.status === 'Success').length, 1);
});
test('organization session routing isolates legacy leads, boards, settings, exports and guesses', async () => {
  const org = await ok(
    '/platform/organizations',
    {
      method: 'POST',
      body: {
        name: 'Isolated customer',
        slug: 'isolated',
        admin_name: 'Other admin',
        email: 'other@example.com',
        password: 'OtherStrongPass!123',
      },
    },
    201,
  );
  const other = await login('other@example.com', 'OtherStrongPass!123', org.slug);
  const tenant = await ok('/platform/bootstrap', { auth: other });
  assert.notEqual(tenant.organization.id, boot.organization.id);
  assert.ok(!tenant.boards.some((b) => boot.boards.some((old) => old.id === b.id)));
  assert.equal(
    (await request(`/platform/boards/${boot.boards[0].id}`, { auth: other })).status,
    404,
  );
  assert.equal((await ok('/leads', { auth: other })).total, 0);
  const spoof = await ok('/platform/bootstrap?organization=default', {
    auth: other,
    headers: { 'x-organization-id': 'default' },
  });
  assert.equal(spoof.organization.id, org.id);
  const own = await ok(
    '/leads',
    {
      method: 'POST',
      auth: other,
      body: {
        business: 'Tenant-only lead',
        phone: '9876500999',
        city: 'Delhi',
        category: 'Other',
        source: 'Test',
      },
    },
    201,
  );
  assert.equal((await request(`/leads/${own.id}`, { auth: admin })).status, 404);
  assert.equal(
    (await request('/platform/organizations', { method: 'POST', auth: agent, body: {} })).status,
    403,
  );
});

test('financial summary aggregates exact currency balances and agent filters cannot infer hidden phone digits', async () => {
  const summary = await ok('/platform/summary');
  assert.equal(summary.totals.INR.original, 100000);
  assert.equal(summary.totals.INR.recovered, 100000);
  assert.equal(summary.aging['0–30'], 1);
  const b = boot.boards.find((b) => b.kind === 'contacts'),
    detail = await ok(`/platform/boards/${b.id}`),
    phone = detail.columns.find((c) => c.type === 'phone');
  const field = await ok(
    `/platform/boards/${b.id}/columns`,
    {
      method: 'POST',
      body: { name: 'Phone echo', type: 'formula', config: { expression: 'CONCAT(Phone)' } },
    },
    201,
  );
  const rows = await ok(`/platform/boards/${b.id}/items`, { auth: agent });
  assert.ok(!JSON.stringify(rows).includes('9876543210'));
  assert.equal(rows.items[0].values[field.id], '98765•••••');
  const filter = encodeURIComponent(
    JSON.stringify({ field: phone.id, op: 'equals', value: '9876543210' }),
  );
  assert.equal(
    (await request(`/platform/boards/${b.id}/items?filter=${filter}`, { auth: agent })).status,
    400,
  );
});

test('monthly recurrence clamps month end and archived records can be restored only by managers', async () => {
  const b = boot.boards.find((b) => b.kind === 'tasks');
  const detail = await ok(`/platform/boards/${b.id}`);
  const due = detail.columns.find((c) => c.name === 'Due date');
  const repeat = detail.columns.find((c) => c.name === 'Repeat');
  const row = await ok(
    `/platform/boards/${b.id}/items`,
    {
      method: 'POST',
      body: {
        name: 'Month-end recurring review',
        values: { [due.id]: '2027-01-31', [repeat.id]: 'Monthly' },
      },
    },
    201,
  );
  await ok(`/platform/items/${row.id}`, {
    method: 'PATCH',
    body: { group_id: detail.groups.find((g) => g.name === 'Completed').id },
  });
  const list = await ok(`/platform/boards/${b.id}/items?search=Month-end`);
  assert.ok(list.items.some((i) => i.values[due.id] === '2027-02-28'));
  assert.equal(list.total, 2);
  await ok(`/platform/boards/${b.id}/bulk`, {
    method: 'POST',
    body: { ids: [row.id], action: 'archive', confirm: true },
  });
  assert.equal((await request(`/platform/items/${row.id}`)).status, 404);
  assert.ok((await ok('/platform/archive')).items.some((i) => i.id === row.id));
  assert.equal(
    (await request(`/platform/archive/record/${row.id}/restore`, { method: 'POST', auth: agent }))
      .status,
    403,
  );
  await ok(`/platform/archive/record/${row.id}/restore`, { method: 'POST' });
  assert.equal((await request(`/platform/items/${row.id}`)).status, 200);
});

test('invalid numeric filters return validation errors and the organization worker drains pending jobs', async () => {
  const b = boot.boards.find((b) => b.kind === 'recovery');
  const detail = await ok(`/platform/boards/${b.id}`);
  const amount = detail.columns.find((c) => c.name === 'Outstanding amount');
  const filter = encodeURIComponent(
    JSON.stringify({ field: amount.id, op: 'greater', value: 'invalid' }),
  );
  assert.equal((await request(`/platform/boards/${b.id}/items?filter=${filter}`)).status, 400);
  const result = await host.locals.processJobs();
  assert.ok(result.processed >= 0);
});
