import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';
import { passwordMatches } from '../server/domain.js';

test('hosted demo seeds requested logins once and preserves later password changes', async () => {
  const keys = [
    'NODE_ENV',
    'DEMO_MODE',
    'SEED_DEMO',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
    'SEED_AGENT_PASSWORD',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const db = await createDatabase({ path: ':memory:', url: '' });
  try {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    await seedDatabase(db);
    const admin = await db.get('SELECT * FROM users WHERE id=?', ['admin']);
    assert.equal(admin.email, 'admin@gmail.com');
    assert.ok(passwordMatches('Admin@123', admin.password));
    for (let i = 1; i <= 10; i++) {
      const user = await db.get('SELECT * FROM users WHERE id=?', [`agent-${i}`]);
      assert.equal(user.email, `user${i}@gmail.com`);
      assert.ok(passwordMatches(`user${i}@123`, user.password));
    }
    await db.run('UPDATE users SET password=? WHERE id=?', ['changed-hash', 'admin']);
    await seedDatabase(db);
    assert.equal(
      (await db.get('SELECT password FROM users WHERE id=?', ['admin'])).password,
      'changed-hash',
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await db.close();
  }
});
