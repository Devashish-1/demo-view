import 'dotenv/config';
import { createDatabase } from './db.js';
import { seedDatabase } from './seed.js';
import { createOrganizationHost } from './platform/organizations.js';
const db = await createDatabase();
await seedDatabase(db);
const app = await createOrganizationHost(db);
const port = Number(process.env.PORT ?? 4000),
  host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(port, host, () =>
  console.log(`Relay CRM ready at http://${host}:${port} (${db.kind})`),
);
let draining;
const timer = setInterval(() => {
  draining ??= app.locals
    .processJobs()
    .catch((error) => console.error('Automation worker failed:', error.message))
    .finally(() => {
      draining = undefined;
    });
}, 15000);
timer.unref();
async function shutdown() {
  clearInterval(timer);
  await draining;
  app.locals.closeStreams();
  server.close(async () => {
    await app.locals.closeTenants();
    await db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
