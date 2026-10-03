import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabase } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';

test('a reopened database retains ownership, active work, and its audit trail', async () => {
  const file = resolve('data', `test-persistence-${randomUUID()}.db`);
  let db;
  try {
    db = await createDatabase({ path: file, url: '' });
    await db.tx(async (tx) => {
      await tx.run(
        'INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',
        [
          'agent',
          'Test Agent',
          'test@example.com',
          'not-a-login-hash',
          'agent',
          '2026-10-03T00:00:00.000Z',
        ],
      );
      await tx.run(
        'INSERT INTO leads(id,business,phone,city,category,source,owner_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [
          'lead',
          'Persistence Test',
          '9876543210',
          'Pune',
          'Other',
          'Test',
          'agent',
          'In Progress',
          '2026-10-03T00:00:00.000Z',
          '2026-10-03T00:00:00.000Z',
        ],
      );
      await tx.run(
        'INSERT INTO active_work(user_id,lead_id,started_at,previous_status) VALUES(?,?,?,?)',
        ['agent', 'lead', '2026-10-03T00:00:00.000Z', 'Pending'],
      );
      await tx.run(
        'INSERT INTO audit(id,user_id,lead_id,action,detail,ip,created_at) VALUES(?,?,?,?,?,?,?)',
        [
          'audit',
          'agent',
          'lead',
          'contact_revealed',
          'Persistence verification',
          '127.0.0.1',
          '2026-10-03T00:00:00.000Z',
        ],
      );
    });
    await db.close();
    db = await createDatabase({ path: file, url: '' });
    assert.equal(
      (await db.get('SELECT * FROM active_work WHERE user_id=?', ['agent'])).lead_id,
      'lead',
    );
    assert.equal((await db.get('SELECT * FROM leads WHERE id=?', ['lead'])).owner_id, 'agent');
    assert.equal(
      (await db.get('SELECT * FROM audit WHERE id=?', ['audit'])).action,
      'contact_revealed',
    );
    await assert.rejects(() => db.run('DELETE FROM audit WHERE id=?', ['audit']), /immutable/);
  } finally {
    await db?.close();
    for (const suffix of ['', '-wal', '-shm']) await unlink(file + suffix).catch(() => {});
  }
});

test('production bootstrap refuses the published demo password before creating any account', async () => {
  const originalEnv = process.env.NODE_ENV,
    originalPassword = process.env.SEED_ADMIN_PASSWORD;
  const db = await createDatabase({ path: ':memory:', url: '' });
  try {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_PASSWORD = 'RelayDemo!2026';
    await assert.rejects(() => seedDatabase(db), /Demo passwords are disabled/);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM users')).count), 0);
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalPassword === undefined) delete process.env.SEED_ADMIN_PASSWORD;
    else process.env.SEED_ADMIN_PASSWORD = originalPassword;
    await db.close();
  }
});
