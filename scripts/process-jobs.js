import 'dotenv/config';
import { createDatabase } from '../server/db.js';
import { createOrganizationHost } from '../server/platform/organizations.js';
const db = await createDatabase();
const host = await createOrganizationHost(db);
try {
  console.log(JSON.stringify(await host.locals.processJobs()));
} finally {
  host.locals.closeStreams();
  await host.locals.closeTenants();
  await db.close();
}
