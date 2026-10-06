import { scope } from './store.js';
export async function workspaceSummary(db, user) {
  const s = scope(user);
  const counts = await db.all(
    'SELECT b.id,b.name,b.kind,COUNT(i.id) AS count FROM p_boards b LEFT JOIN p_items i ON i.board_id=b.id AND i.archived=0' +
      s.sql +
      ' WHERE b.archived=0 GROUP BY b.id,b.name,b.kind ORDER BY b.name',
    s.args,
  );
  const extract = (column) =>
    db.kind === 'sqlite'
      ? `json_extract(i.values_json, '$."' || ${column}.id || '"')`
      : `(i.values_json::jsonb ->> ${column}.id)`;
  const base =
    " FROM p_items i JOIN p_boards b ON b.id=i.board_id JOIN p_columns a ON a.board_id=b.id AND a.name='Outstanding amount' JOIN p_columns c ON c.board_id=b.id AND c.name='Currency' WHERE b.kind='recovery' AND b.archived=0 AND i.archived=0" +
    s.sql;
  const rows = await db.all(
    `SELECT ${extract('c')} AS currency,SUM(ROUND(CAST(${extract('a')} AS NUMERIC)*100)) AS original${base} GROUP BY ${extract('c')}`,
    s.args,
  );
  const payments = await db.all(
    'SELECT p.currency,SUM(p.amount_cents) AS total FROM p_payments p JOIN p_items i ON i.id=p.item_id JOIN p_boards b ON b.id=i.board_id WHERE i.archived=0 AND b.archived=0' +
      s.sql +
      ' GROUP BY p.currency',
    s.args,
  );
  const totals = Object.fromEntries(
    rows.map((row) => [row.currency, { original: Number(row.original), recovered: 0 }]),
  );
  for (const row of payments) {
    totals[row.currency] ??= { original: 0, recovered: 0 };
    totals[row.currency].recovered = Number(row.total);
  }
  const thresholds = [30, 60, 90, 180].map((days) =>
    new Date(Date.now() - days * 86400000).toISOString(),
  );
  const aged = await db.all(
    `SELECT CASE WHEN i.created_at>=? THEN '0–30' WHEN i.created_at>=? THEN '31–60' WHEN i.created_at>=? THEN '61–90' WHEN i.created_at>=? THEN '91–180' ELSE '180+' END AS bucket,COUNT(*) AS count${base} GROUP BY bucket`,
    [...thresholds, ...s.args],
  );
  const aging = { '0–30': 0, '31–60': 0, '61–90': 0, '91–180': 0, '180+': 0 };
  for (const row of aged) aging[row.bucket] = Number(row.count);
  return { counts, totals, aging, limited: false };
}
