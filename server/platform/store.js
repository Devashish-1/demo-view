import { randomUUID } from 'node:crypto';
import { computed, fail, json, name, stamp, validateValues, filterSQL } from './domain.js';
export const manager = (user) => {
  if (user.role === 'agent') fail('Manager access is required.', 403);
};
export function present(columns, values, user) {
  const safeValues = { ...values };
  if (user.role === 'agent')
    for (const col of columns)
      if (col.type === 'phone' && safeValues[col.id])
        safeValues[col.id] = String(safeValues[col.id]).slice(0, 5) + '•••••';
  return computed(columns, safeValues);
}
export function scope(user, alias = 'i') {
  return user.role === 'agent'
    ? { sql: ` AND (${alias}.owner_id=? OR ${alias}.creator_id=?)`, args: [user.id, user.id] }
    : { sql: '', args: [] };
}
export async function board(db, id) {
  const b = await db.get('SELECT * FROM p_boards WHERE id=? AND archived=0', [id]);
  if (!b) fail('Board not found.', 404);
  return b;
}
export async function item(db, id, user) {
  const s = scope(user);
  const row = await db.get(
    'SELECT i.* FROM p_items i JOIN p_boards b ON b.id=i.board_id WHERE i.id=? AND i.archived=0 AND b.archived=0' +
      s.sql,
    [id, ...s.args],
  );
  if (!row) fail('Record not found or access denied.', 404);
  return row;
}
export async function audit(tx, user, action, detail) {
  await tx.run('INSERT INTO audit(id,user_id,action,detail,ip,created_at) VALUES(?,?,?,?,?,?)', [
    randomUUID(),
    user.id,
    action,
    JSON.stringify(detail).slice(0, 15000),
    '',
    stamp(),
  ]);
}
export async function notify(tx, userId, itemId, message) {
  if (userId)
    await tx.run(
      'INSERT INTO p_notifications(id,user_id,item_id,message,created_at) VALUES(?,?,?,?,?)',
      [randomUUID(), userId, itemId, message.slice(0, 600), stamp()],
    );
}
export async function enqueue(tx, boardId, itemId, userId, event, version = 1) {
  const rules = await tx.all('SELECT id FROM p_rules WHERE board_id=? AND event=? AND enabled=1', [
    boardId,
    event,
  ]);
  for (const rule of rules)
    await tx.run(
      'INSERT INTO p_jobs(id,rule_id,item_id,actor_id,event,due_at,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(rule_id,item_id,event) DO NOTHING',
      [randomUUID(), rule.id, itemId, userId, `${event}:${version}`, stamp(), stamp()],
    );
}
export async function createItem(tx, boardId, input, user, { emit = true } = {}) {
  const targetBoard = await board(tx, boardId);
  if (targetBoard.kind === 'recovery') manager(user);
  const groups = await tx.all('SELECT * FROM p_groups WHERE board_id=? ORDER BY position', [
    boardId,
  ]);
  const group = groups.find((g) => g.id === (input.group_id ?? groups[0]?.id));
  if (!group) fail('Choose a group on this board.');
  if (targetBoard.kind === 'recovery' && ['Fully recovered', 'Closed'].includes(group.name))
    fail('Create an open case and record its payments before closing.');
  const owner = user.role === 'agent' ? user.id : input.owner_id || null;
  if (owner && !(await tx.get('SELECT id FROM users WHERE id=? AND active=1', [owner])))
    fail('Assignee is unavailable.');
  if (input.parent_id) {
    const parent = await item(tx, input.parent_id, user);
    if (parent.board_id !== boardId || parent.parent_id)
      fail('Subitems must have a parent on this board (one nested level).');
  }
  const columns = await tx.all('SELECT * FROM p_columns WHERE board_id=?', [boardId]);
  const values = validateValues(columns, input.values ?? {}),
    id = randomUUID(),
    now = stamp();
  await tx.run(
    'INSERT INTO p_items(id,board_id,group_id,parent_id,name,owner_id,creator_id,values_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [
      id,
      boardId,
      group.id,
      input.parent_id || null,
      name(input.name),
      owner,
      user.id,
      JSON.stringify(values),
      now,
      now,
    ],
  );
  await audit(tx, user, 'record_created', { id, board_id: boardId, name: input.name });
  if (owner && owner !== user.id) await notify(tx, owner, id, `You were assigned ${input.name}`);
  if (emit) await enqueue(tx, boardId, id, user.id, 'item.created');
  return id;
}
export async function updateItem(tx, id, input, user, { emit = true } = {}) {
  const old = await item(tx, id, user);
  if (input.version !== undefined && Number(input.version) !== old.version)
    fail('This record changed. Reload before saving.', 409);
  const columns = await tx.all('SELECT * FROM p_columns WHERE board_id=?', [old.board_id]);
  if (user.role === 'agent') {
    for (const column of columns) {
      if (input.values?.[column.id] !== undefined && column.type === 'phone')
        fail('Only a manager can change masked phone details.', 403);
    }
  }
  const values = validateValues(columns, input.values ?? {}, json(old.values_json));
  const title = input.name === undefined ? old.name : name(input.name),
    group = input.group_id ?? old.group_id;
  if (!(await tx.get('SELECT id FROM p_groups WHERE id=? AND board_id=?', [group, old.board_id])))
    fail('Invalid group.');
  const owner = input.owner_id === undefined ? old.owner_id : input.owner_id || null;
  if (user.role === 'agent' && owner !== old.owner_id)
    fail('Only a manager can reassign records.', 403);
  if (owner && !(await tx.get('SELECT id FROM users WHERE id=? AND active=1', [owner])))
    fail('Assignee is unavailable.');
  const b = await board(tx, old.board_id);
  if (b.kind === 'recovery') {
    if (user.role === 'agent') {
      for (const c of columns.filter((c) => ['Outstanding amount', 'Currency'].includes(c.name))) {
        if (values[c.id] !== json(old.values_json)[c.id])
          fail('Only a manager can change financial values.', 403);
      }
    }
    const payments = await tx.get(
      'SELECT COALESCE(SUM(amount_cents),0) AS total,COUNT(*) AS count FROM p_payments WHERE item_id=?',
      [id],
    );
    const amount = columns.find((c) => c.name === 'Outstanding amount'),
      currency = columns.find((c) => c.name === 'Currency');
    if (amount && Math.round(Number(values[amount.id]) * 100) < Number(payments.total))
      fail('Outstanding amount cannot be below recorded payments.');
    if (
      Number(payments.count) &&
      currency &&
      values[currency.id] !== json(old.values_json)[currency.id]
    )
      fail('Currency cannot change after a payment.');
    const selected = await tx.get('SELECT name FROM p_groups WHERE id=?', [group]);
    if (
      ['Fully recovered', 'Closed'].includes(selected.name) &&
      Number(payments.total) < Math.round(Number(values[amount?.id] ?? 0) * 100)
    )
      fail('Record the remaining payment before closing this case.');
  }
  await tx.run(
    'UPDATE p_items SET name=?,owner_id=?,group_id=?,values_json=?,version=version+1,updated_at=? WHERE id=?',
    [title, owner, group, JSON.stringify(values), stamp(), id],
  );
  await audit(tx, user, 'record_updated', {
    id,
    fields: Object.keys(input),
    previous_group: old.group_id,
    group_id: group,
  });
  if (owner && owner !== old.owner_id) await notify(tx, owner, id, `You were assigned ${title}`);
  if (emit) {
    await enqueue(tx, old.board_id, id, user.id, 'item.updated', old.version + 1);
    if (group !== old.group_id)
      await enqueue(tx, old.board_id, id, user.id, 'status.changed', old.version + 1);
  }
  // Recurrence creates the next task exactly once as part of the completion transaction.
  if (b.kind === 'tasks' && group !== old.group_id) {
    const selected = await tx.get('SELECT name FROM p_groups WHERE id=?', [group]);
    const repeat = columns.find((c) => c.name === 'Repeat'),
      due = columns.find((c) => c.name === 'Due date');
    const cadence = values[repeat?.id];
    if (
      selected.name === 'Completed' &&
      ['Daily', 'Weekly', 'Monthly'].includes(cadence) &&
      values[due?.id]
    ) {
      const date = new Date(values[due.id]);
      if (cadence === 'Monthly') {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + 1);
        const lastDay = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
      } else date.setUTCDate(date.getUTCDate() + (cadence === 'Weekly' ? 7 : 1));
      const next = { ...values, [due.id]: date.toISOString().slice(0, 10) };
      await createItem(tx, b.id, { name: title, owner_id: owner, values: next }, user, {
        emit: false,
      });
    }
  }
  return id;
}
export async function listItems(db, boardId, user, query = {}) {
  await board(db, boardId);
  const columns = await db.all('SELECT * FROM p_columns WHERE board_id=? ORDER BY position', [
    boardId,
  ]);
  const s = scope(user),
    args = [boardId, ...s.args];
  let where = 'i.board_id=? AND i.archived=0' + s.sql;
  if (query.search) {
    where += ' AND LOWER(i.name) LIKE ?';
    args.push('%' + String(query.search).slice(0, 180).toLowerCase() + '%');
  }
  if (query.group) {
    where += ' AND i.group_id=?';
    args.push(query.group);
  }
  if (query.owner) {
    where += ' AND i.owner_id=?';
    args.push(query.owner);
  }
  if (query.parent) {
    where += ' AND i.parent_id=?';
    args.push(query.parent);
  } else if (query.parentsOnly === 'true') where += ' AND i.parent_id IS NULL';
  if (query.filter) {
    let filter;
    try {
      filter = typeof query.filter === 'string' ? JSON.parse(query.filter) : query.filter;
    } catch {
      fail('Invalid filter JSON.');
    }
    const filterColumns =
      user.role === 'agent' ? columns.filter((c) => c.type !== 'phone') : columns;
    where += ' AND ' + filterSQL(filter, filterColumns, db.kind, args);
  }
  const sort = ['name', 'created_at', 'updated_at'].includes(query.sort)
      ? query.sort
      : 'updated_at',
    direction = query.direction === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50)),
    page = Math.max(1, Math.floor(Number(query.page) || 1));
  const total = Number(
    (await db.get(`SELECT COUNT(*) AS count FROM p_items i WHERE ${where}`, args)).count,
  );
  const rows = await db.all(
    `SELECT i.*,u.name AS owner_name,g.name AS group_name FROM p_items i LEFT JOIN users u ON u.id=i.owner_id JOIN p_groups g ON g.id=i.group_id WHERE ${where} ORDER BY i.${sort} ${direction},i.id LIMIT ? OFFSET ?`,
    [...args, limit, (page - 1) * limit],
  );
  return {
    items: rows.map((row) => ({
      ...row,
      values_json: undefined,
      ...present(columns, json(row.values_json), user),
    })),
    columns,
    total,
    page,
    limit,
  };
}
