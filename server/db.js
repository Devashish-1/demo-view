import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

// One SQL schema and query interface for the local SQLite and PostgreSQL deployments.
export async function createDatabase(options = {}) {
  const url = options.url ?? process.env.DATABASE_URL;
  let sqlite, pool;
  if (url) pool = new pg.Pool({ connectionString: url, max: 10 });
  else {
    const path = options.path ?? process.env.SQLITE_PATH ?? 'data/relay.db';
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    sqlite = new DatabaseSync(path);
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
  }
  const query = async (sql, args = [], client = pool) => {
    if (sqlite) {
      const statement = sqlite.prepare(sql);
      return /^(SELECT|WITH|PRAGMA)/i.test(sql.trim())
        ? statement.all(...args)
        : statement.run(...args);
    }
    let i = 0;
    const result = await client.query(
      sql.replace(/\?/g, () => `$${++i}`),
      args,
    );
    return result.rows;
  };
  let tail = Promise.resolve();
  const db = {
    kind: sqlite ? 'sqlite' : 'postgresql',
    all: (sql, args) => query(sql, args),
    get: async (sql, args) => (await query(sql, args))[0],
    run: (sql, args) => query(sql, args),
    async tx(fn) {
      let release;
      const previous = tail;
      tail = new Promise((r) => {
        release = r;
      });
      await previous;
      let client;
      try {
        client = pool ? await pool.connect() : null;
      } catch (error) {
        release();
        throw error;
      }
      const tx = {
        all: (sql, args) => query(sql, args, client),
        get: async (sql, args) => (await query(sql, args, client))[0],
        run: (sql, args) => query(sql, args, client),
      };
      try {
        if (sqlite) sqlite.exec('BEGIN IMMEDIATE');
        else {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(7348201)');
        }
        const result = await fn(tx);
        if (sqlite) sqlite.exec('COMMIT');
        else await client.query('COMMIT');
        return result;
      } catch (error) {
        if (sqlite) sqlite.exec('ROLLBACK');
        else await client.query('ROLLBACK');
        throw error;
      } finally {
        client?.release();
        release();
      }
    },
    close: async () => {
      await tail;
      if (sqlite) sqlite.close();
      else await pool.end();
    },
  };
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','agent')),
      active INTEGER NOT NULL DEFAULT 1, available INTEGER NOT NULL DEFAULT 1,
      last_seen TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, business TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', city TEXT NOT NULL,
      category TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
      owner_id TEXT REFERENCES users(id), callback_at TEXT, last_contact_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique ON leads(email) WHERE email <> '';
    CREATE INDEX IF NOT EXISTS leads_owner_status ON leads(owner_id,status);
    CREATE INDEX IF NOT EXISTS leads_city ON leads(city);
    CREATE INDEX IF NOT EXISTS leads_callback ON leads(callback_at);
    CREATE TABLE IF NOT EXISTS active_work (
      user_id TEXT PRIMARY KEY REFERENCES users(id), lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id),
      started_at TEXT NOT NULL, previous_status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), user_id TEXT NOT NULL REFERENCES users(id),
      disposition TEXT NOT NULL, notes TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 0,
      callback_at TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calls_created ON calls(created_at);
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), lead_id TEXT REFERENCES leads(id),
      action TEXT NOT NULL, detail TEXT NOT NULL, ip TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL,
      rows_json TEXT NOT NULL, result_json TEXT, state TEXT NOT NULL DEFAULT 'ready', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
  `;
  if (sqlite) {
    sqlite.exec(schema);
    sqlite.exec(
      "CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit entries are immutable'); END; CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit entries are immutable'); END;",
    );
  } else {
    await db.tx(async (tx) => {
      await tx.run(schema);
      await tx.run(`CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Audit entries are immutable'; END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS audit_immutable ON audit;
      CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();`);
    });
  }
  return db;
}
