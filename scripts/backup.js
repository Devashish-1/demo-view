import 'dotenv/config';
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.DATABASE_URL) {
  throw new Error('This command backs up SQLite. Use pg_dump for a PostgreSQL deployment.');
}
const source = resolve(process.env.SQLITE_PATH || 'data/relay.db');
const folder = resolve('data/backups');
mkdirSync(folder, { recursive: true });
const destination = resolve(folder, `relay-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  console.log(`Consistent database backup saved: ${destination}`);
} finally {
  db.close();
}
