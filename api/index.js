import { createDatabase } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';
import { createApp } from '../server/app.js';

let ready;
async function initialize() {
  if (!process.env.DATABASE_URL) throw new Error('Connect PostgreSQL and set DATABASE_URL before deploying.');
  const db = await createDatabase();
  await seedDatabase(db);
  return createApp(db);
}

export default async function handler(req, res) {
  try {
    ready ??= initialize().catch((error) => { ready = undefined; throw error; });
    const app = await ready;
    return app(req, res);
  } catch (error) {
    console.error('CRM initialization failed:', error.message);
    res.status(503).json({ error: 'Database setup is not complete. Please contact the administrator.' });
  }
}
