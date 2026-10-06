// Physical table namespaces keep existing and new CRM queries isolated together.
// Namespaces come only from the server-owned organization directory, never request IDs.
const identifiers = new Set(
  `users sessions leads active_work calls audit imports settings
leads_email_unique leads_owner_status leads_city leads_callback calls_created audit_created
audit_no_update audit_no_delete audit_immutable prevent_audit_mutation
p_workspaces p_boards p_groups p_columns p_items p_views p_comments p_relations
p_payments p_notifications p_rules p_jobs p_runs p_profiles p_members p_migrations
p_items_board p_items_owner p_comments_item p_notifications_user p_jobs_due p_relations_target
p_views_board p_payments_case p_conversion p_dashboards`.split(/\s+/),
);
export function scopedSQL(sql, namespace) {
  if (!namespace) return sql;
  // Skip SQL strings so status values and human-facing error messages remain unchanged.
  return sql.replace(/'([^']|'')*'|\b[a-z_][a-z0-9_]*\b/gi, (token) =>
    identifiers.has(token) ? `${namespace}_${token}` : token,
  );
}
export async function migratePlatform(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS p_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS p_workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS p_boards(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES p_workspaces(id),name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL DEFAULT 'custom',access TEXT NOT NULL DEFAULT 'assigned',archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS p_groups(id TEXT PRIMARY KEY,board_id TEXT NOT NULL REFERENCES p_boards(id),name TEXT NOT NULL,color TEXT NOT NULL DEFAULT '#657b4c',position INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS p_columns(id TEXT PRIMARY KEY,board_id TEXT NOT NULL REFERENCES p_boards(id),name TEXT NOT NULL,type TEXT NOT NULL,config TEXT NOT NULL DEFAULT '{}',position INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS p_items(id TEXT PRIMARY KEY,board_id TEXT NOT NULL REFERENCES p_boards(id),group_id TEXT NOT NULL REFERENCES p_groups(id),parent_id TEXT REFERENCES p_items(id),name TEXT NOT NULL,owner_id TEXT REFERENCES users(id),creator_id TEXT NOT NULL REFERENCES users(id),values_json TEXT NOT NULL DEFAULT '{}',archived INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS p_items_board ON p_items(board_id,archived,updated_at)`,
    `CREATE INDEX IF NOT EXISTS p_items_owner ON p_items(owner_id,board_id)`,
    `CREATE TABLE IF NOT EXISTS p_views(id TEXT PRIMARY KEY,board_id TEXT NOT NULL REFERENCES p_boards(id),user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,shared INTEGER NOT NULL DEFAULT 0,config TEXT NOT NULL,created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS p_views_board ON p_views(board_id,user_id)`,
    `CREATE TABLE IF NOT EXISTS p_comments(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES p_items(id),user_id TEXT NOT NULL REFERENCES users(id),parent_id TEXT REFERENCES p_comments(id),body TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS p_comments_item ON p_comments(item_id,created_at)`,
    `CREATE TABLE IF NOT EXISTS p_relations(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES p_items(id),target_id TEXT NOT NULL REFERENCES p_items(id),label TEXT NOT NULL DEFAULT 'Related',UNIQUE(source_id,target_id,label))`,
    `CREATE INDEX IF NOT EXISTS p_relations_target ON p_relations(target_id)`,
    `CREATE TABLE IF NOT EXISTS p_payments(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES p_items(id),amount_cents BIGINT NOT NULL CHECK(amount_cents>0),currency TEXT NOT NULL,reference TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL REFERENCES users(id),paid_at TEXT NOT NULL,created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS p_payments_case ON p_payments(item_id,paid_at)`,
    `CREATE TABLE IF NOT EXISTS p_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),item_id TEXT REFERENCES p_items(id),message TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS p_notifications_user ON p_notifications(user_id,created_at)`,
    `CREATE TABLE IF NOT EXISTS p_rules(id TEXT PRIMARY KEY,board_id TEXT NOT NULL REFERENCES p_boards(id),name TEXT NOT NULL,event TEXT NOT NULL,condition_json TEXT NOT NULL,action_json TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS p_jobs(id TEXT PRIMARY KEY,rule_id TEXT NOT NULL REFERENCES p_rules(id),item_id TEXT NOT NULL REFERENCES p_items(id),actor_id TEXT NOT NULL REFERENCES users(id),event TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,due_at TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(rule_id,item_id,event))`,
    `CREATE INDEX IF NOT EXISTS p_jobs_due ON p_jobs(state,due_at)`,
    `CREATE TABLE IF NOT EXISTS p_runs(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES p_jobs(id),status TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS p_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),preferences TEXT NOT NULL DEFAULT '{}')`,
    `CREATE TABLE IF NOT EXISTS p_conversion(lead_id TEXT PRIMARY KEY REFERENCES leads(id),company_id TEXT NOT NULL REFERENCES p_items(id),contact_id TEXT NOT NULL REFERENCES p_items(id),deal_id TEXT REFERENCES p_items(id),created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS p_dashboards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,config TEXT NOT NULL,shared INTEGER NOT NULL DEFAULT 0)`,
  ];
  await db.tx(async (tx) => {
    for (const sql of statements) await tx.run(sql);
    await tx.run(
      'INSERT INTO p_migrations(version,applied_at) VALUES(?,?) ON CONFLICT(version) DO NOTHING',
      [1, new Date().toISOString()],
    );
  });
}
