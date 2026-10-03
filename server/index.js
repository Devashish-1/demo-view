import 'dotenv/config';
import { createDatabase } from './db.js';
import { seedDatabase } from './seed.js';
import { createApp } from './app.js';
const db = await createDatabase();
await seedDatabase(db);
const app = createApp(db);
const port = Number(process.env.PORT ?? 4000),
  host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(port, host, () =>
  console.log(`Relay CRM ready at http://${host}:${port} (${db.kind})`),
);
async function shutdown() {
  app.locals.closeStreams();
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
