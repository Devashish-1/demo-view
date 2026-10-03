import 'dotenv/config';
import { createDatabase } from '../server/db.js';
import { passwordHash } from '../server/domain.js';

// Explicit, one-time migration for the original local demonstration accounts.
const db = await createDatabase();
try {
  await db.tx(async (tx) => {
    const accounts = [
      { id: 'admin', old: 'admin@relay.local', email: 'admin@gmail.com', password: 'Admin@123' },
    ];
    for (let i = 1; i <= 10; i++)
      accounts.push({
        id: `agent-${i}`,
        old: `agent${i}@relay.local`,
        email: `user${i}@gmail.com`,
        password: `user${i}@123`,
      });
    for (const account of accounts) {
      const user = await tx.get('SELECT email FROM users WHERE id=?', [account.id]);
      if (user?.email !== account.old) continue;
      await tx.run('UPDATE users SET email=?,password=? WHERE id=?', [
        account.email,
        passwordHash(account.password),
        account.id,
      ]);
      await tx.run('DELETE FROM sessions WHERE user_id=?', [account.id]);
    }
  });
  console.log('Original demo accounts updated.');
} finally {
  await db.close();
}
