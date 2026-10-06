import { workspaceSummary } from './metrics.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import { types, json, name, stamp, fail, computed, formula } from './domain.js';
import { templates, createBoard } from './templates.js';
import {
  manager,
  board,
  item,
  scope,
  audit,
  notify,
  createItem,
  updateItem,
  listItems,
  enqueue,
  present,
} from './store.js';
import { runJobs } from './automation.js';

export function platformRouter(db, options = {}) {
  const router = express.Router();
  router.get('/bootstrap', async (req, res) => {
    const workspaces = await db.all(
      'SELECT * FROM p_workspaces WHERE archived=0 ORDER BY created_at',
    );
    const boards = await db.all(
      'SELECT b.* FROM p_boards b JOIN p_workspaces w ON w.id=b.workspace_id WHERE b.archived=0 AND w.archived=0 ORDER BY b.created_at',
    );
    const users = await db.all('SELECT id,name,role FROM users WHERE active=1 ORDER BY name');
    res.json({
      organization: options.organization ?? { id: 'default', name: 'Relay', slug: 'default' },
      workspaces,
      boards,
      users,
      types,
      templates: Object.entries(templates).map(([id, t]) => ({ id, name: t.name })),
      capabilities: {
        ai: false,
        calling: false,
        email: false,
        files: false,
        oauth: false,
        webhooks: false,
      },
    });
  });
  router.get('/archive', async (req, res) => {
    manager(req.user);
    res.json({
      items: await db.all(
        "SELECT id,name,'record' AS kind FROM p_items WHERE archived=1 UNION ALL SELECT id,name,'board' AS kind FROM p_boards WHERE archived=1 UNION ALL SELECT id,name,'workspace' AS kind FROM p_workspaces WHERE archived=1 ORDER BY name LIMIT 500",
      ),
    });
  });
  router.post('/archive/:kind/:id/restore', async (req, res) => {
    manager(req.user);
    const table = { record: 'p_items', board: 'p_boards', workspace: 'p_workspaces' }[
      req.params.kind
    ];
    if (!table) fail('Unknown archived object.');
    await db.tx(async (tx) => {
      const row = await tx.get(`SELECT * FROM ${table} WHERE id=? AND archived=1`, [req.params.id]);
      if (!row) fail('Archived object not found.', 404);
      if (row.board_id) await board(tx, row.board_id);
      if (
        row.parent_id &&
        !(await tx.get('SELECT id FROM p_items WHERE id=? AND archived=0', [row.parent_id]))
      )
        fail('Restore the parent record first.');
      if (
        row.workspace_id &&
        !(await tx.get('SELECT id FROM p_workspaces WHERE id=? AND archived=0', [row.workspace_id]))
      )
        fail('Restore the workspace first.');
      await tx.run(`UPDATE ${table} SET archived=0 WHERE id=?`, [row.id]);
      await audit(tx, req.user, 'archive_restored', { kind: req.params.kind, id: row.id });
    });
    res.json({ ok: true });
  });
  router.post('/organizations', async (req, res) => {
    if (!options.provisionOrganization) fail('Organization provisioning is not enabled.', 503);
    const result = await options.provisionOrganization(req.body, req.user);
    await db.tx((tx) =>
      audit(tx, req.user, 'organization_provisioned', { id: result.id, slug: result.slug }),
    );
    res.status(201).json(result);
  });
  router.post('/workspaces', async (req, res) => {
    manager(req.user);
    const id = randomUUID();
    await db.tx(async (tx) => {
      await tx.run('INSERT INTO p_workspaces(id,name,created_at) VALUES(?,?,?)', [
        id,
        name(req.body.name),
        stamp(),
      ]);
      await audit(tx, req.user, 'workspace_created', { id });
    });
    res.status(201).json({ id });
  });
  router.patch('/workspaces/:id', async (req, res) => {
    manager(req.user);
    if (!(await db.get('SELECT id FROM p_workspaces WHERE id=?', [req.params.id])))
      fail('Workspace not found.', 404);
    await db.tx(async (tx) => {
      if (req.body.name !== undefined)
        await tx.run('UPDATE p_workspaces SET name=? WHERE id=?', [
          name(req.body.name),
          req.params.id,
        ]);
      if (req.body.archived !== undefined)
        await tx.run('UPDATE p_workspaces SET archived=? WHERE id=?', [
          req.body.archived ? 1 : 0,
          req.params.id,
        ]);
      await audit(tx, req.user, 'workspace_updated', { id: req.params.id });
    });
    res.json({ ok: true });
  });
  router.post('/boards', async (req, res) => {
    manager(req.user);
    if (!templates[req.body.kind ?? 'custom']) fail('Unknown template.');
    if (
      !(await db.get('SELECT id FROM p_workspaces WHERE id=? AND archived=0', [
        req.body.workspace_id,
      ]))
    )
      fail('Workspace not found.', 404);
    const id = await db.tx(async (tx) => {
      const id = await createBoard(
        tx,
        req.body.workspace_id,
        name(req.body.name),
        req.body.kind ?? 'custom',
        String(req.body.description ?? '').slice(0, 1000),
      );
      await audit(tx, req.user, 'board_created', { id });
      return id;
    });
    res.status(201).json({ id });
  });
  router.get('/boards/:id', async (req, res) => {
    const b = await board(db, req.params.id);
    res.json({
      ...b,
      groups: await db.all('SELECT * FROM p_groups WHERE board_id=? ORDER BY position,id', [b.id]),
      columns: await db.all('SELECT * FROM p_columns WHERE board_id=? ORDER BY position,id', [
        b.id,
      ]),
      views: await db.all(
        'SELECT * FROM p_views WHERE board_id=? AND (shared=1 OR user_id=?) ORDER BY created_at',
        [b.id, req.user.id],
      ),
    });
  });
  router.patch('/boards/:id', async (req, res) => {
    manager(req.user);
    await board(db, req.params.id);
    await db.tx(async (tx) => {
      if (req.body.name !== undefined)
        await tx.run('UPDATE p_boards SET name=? WHERE id=?', [name(req.body.name), req.params.id]);
      if (req.body.archived !== undefined)
        await tx.run('UPDATE p_boards SET archived=? WHERE id=?', [
          req.body.archived ? 1 : 0,
          req.params.id,
        ]);
      await audit(tx, req.user, 'board_updated', { id: req.params.id });
    });
    res.json({ ok: true });
  });
  router.post('/boards/:id/groups', async (req, res) => {
    manager(req.user);
    await board(db, req.params.id);
    const id = randomUUID();
    await db.tx(async (tx) => {
      const count = Number(
        (await tx.get('SELECT COUNT(*) AS n FROM p_groups WHERE board_id=?', [req.params.id])).n,
      );
      if (count >= 40) fail('Maximum 40 groups per board.');
      await tx.run('INSERT INTO p_groups(id,board_id,name,position,color) VALUES(?,?,?,?,?)', [
        id,
        req.params.id,
        name(req.body.name),
        count,
        /^#[0-9a-f]{6}$/i.test(req.body.color ?? '') ? req.body.color : '#657b4c',
      ]);
      await audit(tx, req.user, 'group_created', { id });
    });
    res.status(201).json({ id });
  });
  router.patch('/groups/:id', async (req, res) => {
    manager(req.user);
    const group = await db.get('SELECT * FROM p_groups WHERE id=?', [req.params.id]);
    if (!group) fail('Group not found.', 404);
    await board(db, group.board_id);
    await db.tx(async (tx) => {
      await tx.run('UPDATE p_groups SET name=?,position=? WHERE id=?', [
        req.body.name === undefined ? group.name : name(req.body.name),
        Number.isInteger(req.body.position) ? req.body.position : group.position,
        group.id,
      ]);
      await audit(tx, req.user, 'group_updated', { id: group.id });
    });
    res.json({ ok: true });
  });
  router.post('/boards/:id/columns', async (req, res) => {
    manager(req.user);
    await board(db, req.params.id);
    const type = req.body.type,
      label = name(req.body.name),
      config = req.body.config ?? {};
    if (!types.includes(type) || !config || typeof config !== 'object' || Array.isArray(config))
      fail('Invalid column type or configuration.');
    if (
      ['status', 'dropdown', 'multiselect'].includes(type) &&
      (!Array.isArray(config.options) ||
        !config.options.length ||
        config.options.length > 40 ||
        config.options.some((v) => typeof v !== 'string' || v.length > 100))
    )
      fail('Provide 1–40 option labels.');
    if (type === 'currency' && !/^[A-Z]{3}$/.test(config.currency ?? 'INR'))
      fail('Use an ISO currency code.');
    const existing = await db.all('SELECT * FROM p_columns WHERE board_id=?', [req.params.id]);
    if (existing.length >= 60) fail('Maximum 60 columns per board.');
    if (existing.some((c) => c.name.toLowerCase() === label.toLowerCase()))
      fail('Field name already exists.', 409);
    if (type === 'formula') {
      const vars = Object.fromEntries(
        existing
          .filter((c) => c.type !== 'formula')
          .map((c) => [c.name.replace(/[^A-Za-z0-9_]/g, ''), 1]),
      );
      formula(config.expression, vars);
    }
    if (
      config.required &&
      Number(
        (await db.get('SELECT COUNT(*) AS n FROM p_items WHERE board_id=?', [req.params.id])).n,
      )
    )
      fail('Add optional fields to populated boards; required fields need a data migration.');
    const id = randomUUID();
    await db.tx(async (tx) => {
      await tx.run(
        'INSERT INTO p_columns(id,board_id,name,type,config,position) VALUES(?,?,?,?,?,?)',
        [id, req.params.id, label, type, JSON.stringify(config), existing.length],
      );
      await audit(tx, req.user, 'field_created', { id, board_id: req.params.id });
    });
    res.status(201).json({ id });
  });
  router.get('/boards/:id/items', async (req, res) =>
    res.json(await listItems(db, req.params.id, req.user, req.query)),
  );
  router.post('/boards/:id/items', async (req, res) => {
    const id = await db.tx((tx) => createItem(tx, req.params.id, req.body, req.user));
    res.status(201).json({ id });
  });
  router.patch('/items/:id', async (req, res) => {
    await db.tx((tx) => updateItem(tx, req.params.id, req.body, req.user));
    res.json({ ok: true });
  });
  router.post('/boards/:id/bulk', async (req, res) => {
    manager(req.user);
    await board(db, req.params.id);
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || new Set(ids).size !== ids.length)
      fail('Select 1–200 distinct records.');
    await db.tx(async (tx) => {
      for (const id of ids) {
        const row = await item(tx, id, req.user);
        if (row.board_id !== req.params.id) fail('Record is on another board.');
        if (req.body.action === 'archive') {
          if (!req.body.confirm) fail('Confirm archive.');
          await tx.run(
            'UPDATE p_items SET archived=1,updated_at=?,version=version+1 WHERE id=? OR parent_id=?',
            [stamp(), id, id],
          );
          await audit(tx, req.user, 'record_archived', { id });
        } else if (req.body.action === 'update')
          await updateItem(tx, id, req.body.changes ?? {}, req.user);
        else fail('Unknown bulk action.');
      }
    });
    res.json({ updated: ids.length });
  });
  router.get('/items/:id', async (req, res) => {
    const row = await item(db, req.params.id, req.user),
      columns = await db.all('SELECT * FROM p_columns WHERE board_id=?', [row.board_id]),
      s = scope(req.user);
    const linked = await db.all(
      `SELECT i.id,i.name,i.board_id,i.owner_id,i.creator_id,b.name AS board_name,r.label,r.id AS relation_id FROM p_relations r JOIN p_items i ON i.id=CASE WHEN r.source_id=? THEN r.target_id ELSE r.source_id END JOIN p_boards b ON b.id=i.board_id WHERE (r.source_id=? OR r.target_id=?) AND i.archived=0 AND b.archived=0${s.sql}`,
      [row.id, row.id, row.id, ...s.args],
    );
    const children = await db.all(
      'SELECT i.id,i.name,i.board_id FROM p_items i WHERE i.parent_id=? AND i.archived=0' + s.sql,
      [row.id, ...s.args],
    );
    const comments = await db.all(
      'SELECT c.*,u.name AS author FROM p_comments c JOIN users u ON u.id=c.user_id WHERE c.item_id=? ORDER BY c.created_at DESC LIMIT 100',
      [row.id],
    );
    const payments = await db.all(
      'SELECT p.*,u.name AS author FROM p_payments p JOIN users u ON u.id=p.user_id WHERE p.item_id=? ORDER BY p.paid_at DESC LIMIT 100',
      [row.id],
    );
    const total = Number(
        (
          await db.get(
            'SELECT COALESCE(SUM(amount_cents),0) AS total FROM p_payments WHERE item_id=?',
            [row.id],
          )
        ).total,
      ),
      values = json(row.values_json);
    const amount = columns.find((c) => c.name === 'Outstanding amount'),
      currency = columns.find((c) => c.name === 'Currency');
    const principal = Math.round(Number(values[amount?.id] ?? 0) * 100);
    res.json({
      ...row,
      values_json: undefined,
      ...present(columns, values, req.user),
      columns,
      linked,
      children,
      comments,
      payments,
      balance: {
        original: principal,
        recovered: total,
        pending: principal - total,
        percentage: principal ? (total / principal) * 100 : 0,
        currency: values[currency?.id] ?? 'INR',
        age_days: Math.max(0, Math.floor((Date.now() - Date.parse(row.created_at)) / 86400000)),
      },
    });
  });
  router.post('/items/:id/relations', async (req, res) => {
    await db.tx(async (tx) => {
      const a = await item(tx, req.params.id, req.user),
        b = await item(tx, req.body.target_id, req.user);
      if (a.id === b.id) fail('A record cannot link to itself.');
      await tx.run(
        'INSERT INTO p_relations(id,source_id,target_id,label) VALUES(?,?,?,?) ON CONFLICT(source_id,target_id,label) DO NOTHING',
        [randomUUID(), a.id, b.id, name(req.body.label ?? 'Related')],
      );
      await audit(tx, req.user, 'records_linked', { source: a.id, target: b.id });
    });
    res.status(201).json({ ok: true });
  });
  router.delete('/relations/:id', async (req, res) => {
    await db.tx(async (tx) => {
      const relation = await tx.get('SELECT * FROM p_relations WHERE id=?', [req.params.id]);
      if (!relation) fail('Relation not found.', 404);
      await item(tx, relation.source_id, req.user);
      await item(tx, relation.target_id, req.user);
      await tx.run('DELETE FROM p_relations WHERE id=?', [relation.id]);
      await audit(tx, req.user, 'records_unlinked', { id: relation.id });
    });
    res.json({ ok: true });
  });
  router.post('/items/:id/comments', async (req, res) => {
    const id = randomUUID();
    await db.tx(async (tx) => {
      const record = await item(tx, req.params.id, req.user);
      const body = String(req.body.body ?? '').trim();
      if (!body || body.length > 10000) fail('Write a comment up to 10,000 characters.');
      if (
        req.body.parent_id &&
        !(await tx.get('SELECT id FROM p_comments WHERE id=? AND item_id=?', [
          req.body.parent_id,
          record.id,
        ]))
      )
        fail('Reply target is not on this record.');
      await tx.run(
        'INSERT INTO p_comments(id,item_id,user_id,parent_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        [id, record.id, req.user.id, req.body.parent_id || null, body, stamp(), stamp()],
      );
      const mentions = Array.isArray(req.body.mentions) ? req.body.mentions.slice(0, 20) : [];
      for (const userId of mentions) {
        const target = await tx.get('SELECT id,role FROM users WHERE id=? AND active=1', [userId]);
        if (!target) fail('Mentioned user is unavailable.');
        await item(tx, record.id, target);
        await notify(tx, userId, record.id, `${req.user.name} mentioned you on ${record.name}`);
      }
      await audit(tx, req.user, 'comment_created', { item_id: record.id, id });
    });
    res.status(201).json({ id });
  });
  router.patch('/comments/:id', async (req, res) => {
    await db.tx(async (tx) => {
      const row = await tx.get('SELECT * FROM p_comments WHERE id=?', [req.params.id]);
      if (!row) fail('Comment not found.', 404);
      await item(tx, row.item_id, req.user);
      if (row.user_id !== req.user.id) fail('Only the author can edit a comment.', 403);
      const body = String(req.body.body ?? '').trim();
      if (!body || body.length > 10000) fail('Invalid comment.');
      await tx.run('UPDATE p_comments SET body=?,updated_at=? WHERE id=?', [body, stamp(), row.id]);
      await audit(tx, req.user, 'comment_updated', { id: row.id });
    });
    res.json({ ok: true });
  });
  router.delete('/comments/:id', async (req, res) => {
    await db.tx(async (tx) => {
      const row = await tx.get('SELECT * FROM p_comments WHERE id=?', [req.params.id]);
      if (!row) fail('Comment not found.', 404);
      await item(tx, row.item_id, req.user);
      if (row.user_id !== req.user.id && req.user.role !== 'admin') fail('Access denied.', 403);
      await tx.run('UPDATE p_comments SET body=?,updated_at=? WHERE id=?', [
        '[Comment removed]',
        stamp(),
        row.id,
      ]);
      await audit(tx, req.user, 'comment_removed', { id: row.id });
    });
    res.json({ ok: true });
  });
  router.post('/items/:id/payments', async (req, res) => {
    manager(req.user);
    const input = req.body;
    if (!/^\d+(\.\d{1,2})?$/.test(String(input.amount ?? '')))
      fail('Enter a positive payment with no more than 2 decimal places.');
    const cents = Math.round(Number(input.amount) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1e14) fail('Invalid payment amount.');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.idempotency_key ?? ''))
      fail('A unique payment request key is required.');
    const id = await db.tx(async (tx) => {
      const row = await item(tx, req.params.id, req.user),
        b = await board(tx, row.board_id);
      if (b.kind !== 'recovery') fail('Payments must belong to a recovery case.');
      const previous = await tx.get('SELECT * FROM p_payments WHERE idempotency_key=?', [
        input.idempotency_key,
      ]);
      if (previous) {
        if (previous.item_id !== row.id || Number(previous.amount_cents) !== cents)
          fail('Payment key was already used for different details.', 409);
        return previous.id;
      }
      const columns = await tx.all('SELECT * FROM p_columns WHERE board_id=?', [b.id]),
        values = json(row.values_json),
        amount = columns.find((c) => c.name === 'Outstanding amount'),
        currency = columns.find((c) => c.name === 'Currency');
      const original = Math.round(Number(values[amount?.id] ?? 0) * 100),
        recovered = Number(
          (
            await tx.get(
              'SELECT COALESCE(SUM(amount_cents),0) AS total FROM p_payments WHERE item_id=?',
              [row.id],
            )
          ).total,
        );
      if (cents > original - recovered) fail('Payment exceeds the pending balance.');
      if (input.paid_at && !Number.isFinite(Date.parse(input.paid_at)))
        fail('Enter a valid payment date.');
      const id = randomUUID(),
        paidAt = input.paid_at ? new Date(input.paid_at).toISOString() : stamp();
      if (Date.parse(paidAt) > Date.now() + 60000) fail('Payment date cannot be in the future.');
      await tx.run(
        'INSERT INTO p_payments(id,item_id,amount_cents,currency,reference,idempotency_key,user_id,paid_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          id,
          row.id,
          cents,
          values[currency?.id] ?? 'INR',
          String(input.reference ?? '').slice(0, 200),
          input.idempotency_key,
          req.user.id,
          paidAt,
          stamp(),
        ],
      );
      const group = await tx.get('SELECT id FROM p_groups WHERE board_id=? AND name=?', [
        b.id,
        cents + recovered === original ? 'Fully recovered' : 'Partial payment',
      ]);
      if (group) await updateItem(tx, row.id, { group_id: group.id }, req.user);
      await audit(tx, req.user, 'payment_recorded', { id, item_id: row.id, amount_cents: cents });
      await enqueue(tx, b.id, row.id, req.user.id, 'payment.created', row.version + 1);
      return id;
    });
    res.status(201).json({ id });
  });
  router.post('/boards/:id/views', async (req, res) => {
    await board(db, req.params.id);
    if (req.body.shared) manager(req.user);
    const config = req.body.config ?? {};
    if (!['table', 'kanban', 'calendar', 'timeline'].includes(config.type))
      fail('Unsupported view.');
    if (JSON.stringify(config).length > 12000) fail('View configuration is too large.');
    const id = randomUUID();
    await db.run(
      'INSERT INTO p_views(id,board_id,user_id,name,shared,config,created_at) VALUES(?,?,?,?,?,?,?)',
      [
        id,
        req.params.id,
        req.user.id,
        name(req.body.name),
        req.body.shared ? 1 : 0,
        JSON.stringify(config),
        stamp(),
      ],
    );
    res.status(201).json({ id });
  });
  router.delete('/views/:id', async (req, res) => {
    const v = await db.get('SELECT * FROM p_views WHERE id=?', [req.params.id]);
    if (!v) fail('View not found.', 404);
    if (v.user_id !== req.user.id && req.user.role !== 'admin') fail('Access denied.', 403);
    await db.run('DELETE FROM p_views WHERE id=?', [v.id]);
    res.json({ ok: true });
  });
  router.get('/notifications', async (req, res) => {
    res.json({
      notifications: await db.all(
        'SELECT * FROM p_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
        [req.user.id],
      ),
    });
  });
  router.post('/notifications/read', async (req, res) => {
    await db.run('UPDATE p_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL', [
      stamp(),
      req.user.id,
    ]);
    res.json({ ok: true });
  });
  router.get('/search', async (req, res) => {
    const s = scope(req.user);
    const rows = await db.all(
      'SELECT i.id,i.name,i.board_id,b.name AS board_name,b.kind FROM p_items i JOIN p_boards b ON b.id=i.board_id WHERE i.archived=0 AND b.archived=0 AND LOWER(i.name) LIKE ?' +
        s.sql +
        ' ORDER BY i.updated_at DESC LIMIT 40',
      [
        '%' +
          String(req.query.q ?? '')
            .slice(0, 180)
            .toLowerCase() +
          '%',
        ...s.args,
      ],
    );
    res.json({ items: rows });
  });
  router.get('/boards/:id/export', async (req, res) => {
    const b = await board(db, req.params.id);
    const data = await listItems(db, b.id, req.user, { ...req.query, page: 1, limit: 200 });
    if (data.total > 200) fail('Narrow the filter to 200 records or fewer for this export.');
    const cell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
    const records = data.items.map((row) =>
      Object.fromEntries(
        Object.entries({
          Name: row.name,
          Group: row.group_name,
          Owner: row.owner_name,
          ...Object.fromEntries(
            data.columns.map((c) => [
              c.name,
              typeof row.values[c.id] === 'object'
                ? JSON.stringify(row.values[c.id])
                : row.values[c.id],
            ]),
          ),
        }).map(([k, v]) => [k, cell(v)]),
      ),
    );
    await db.tx((tx) =>
      audit(tx, req.user, 'board_exported', { board_id: b.id, count: records.length }),
    );
    res
      .set('Content-Disposition', 'attachment; filename="relay-board.csv"')
      .type('text/csv')
      .send('\uFEFF' + Papa.unparse(records));
  });
  router.post('/boards/:id/import', async (req, res) => {
    manager(req.user);
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length > 200 || !rows.length)
      fail('Import accepts 1–200 mapped JSON records per batch.');
    const ids = await db.tx(async (tx) => {
      const ids = [];
      for (const row of rows) ids.push(await createItem(tx, req.params.id, row, req.user));
      return ids;
    });
    res.status(201).json({ ids, imported: ids.length });
  });
  router.post('/leads/:id/convert', async (req, res) => {
    manager(req.user);
    const result = await db.tx(async (tx) => {
      const lead = await tx.get('SELECT * FROM leads WHERE id=?', [req.params.id]);
      if (!lead) fail('Lead not found.', 404);
      const existing = await tx.get('SELECT * FROM p_conversion WHERE lead_id=?', [lead.id]);
      if (existing) return existing;
      const boards = await tx.all(
        "SELECT * FROM p_boards WHERE kind IN ('companies','contacts','deals') AND archived=0 ORDER BY created_at",
      );
      const selected = Object.fromEntries(
        ['companies', 'contacts', 'deals'].map((k) => [k, boards.find((b) => b.kind === k)]),
      );
      if (Object.values(selected).some((v) => !v))
        fail('Create Company, Contact and Deal boards before converting.');
      async function make(kind, title, fields) {
        const b = selected[kind],
          columns = await tx.all('SELECT * FROM p_columns WHERE board_id=?', [b.id]);
        const values = {};
        for (const c of columns) if (fields[c.name]) values[c.id] = fields[c.name];
        return createItem(tx, b.id, { name: title, owner_id: lead.owner_id, values }, req.user);
      }
      const company_id = await make('companies', lead.business, {
        Email: lead.email,
        Phone: lead.phone,
        City: lead.city,
      });
      const contact_id = await make('contacts', lead.contact || lead.business, {
        Email: lead.email,
        Phone: lead.phone,
      });
      const deal_id = await make('deals', `${lead.business} — opportunity`, {
        Source: lead.source,
      });
      for (const [source, target, label] of [
        [company_id, contact_id, 'Contact'],
        [company_id, deal_id, 'Deal'],
        [contact_id, deal_id, 'Opportunity'],
      ])
        await tx.run('INSERT INTO p_relations(id,source_id,target_id,label) VALUES(?,?,?,?)', [
          randomUUID(),
          source,
          target,
          label,
        ]);
      await tx.run(
        'INSERT INTO p_conversion(lead_id,company_id,contact_id,deal_id,created_at) VALUES(?,?,?,?,?)',
        [lead.id, company_id, contact_id, deal_id, stamp()],
      );
      await audit(tx, req.user, 'lead_converted', {
        lead_id: lead.id,
        company_id,
        contact_id,
        deal_id,
      });
      return { company_id, contact_id, deal_id };
    });
    res.json(result);
  });
  router.get('/rules', async (req, res) => {
    manager(req.user);
    res.json({
      rules: await db.all(
        'SELECT r.*,b.name AS board_name FROM p_rules r JOIN p_boards b ON b.id=r.board_id ORDER BY r.created_at DESC',
      ),
      runs: await db.all(
        'SELECT r.*,j.rule_id,j.item_id,j.attempts,j.state FROM p_runs r JOIN p_jobs j ON j.id=r.job_id ORDER BY r.created_at DESC LIMIT 100',
      ),
      pending: Number((await db.get("SELECT COUNT(*) AS n FROM p_jobs WHERE state='pending'")).n),
    });
  });
  router.post('/rules', async (req, res) => {
    manager(req.user);
    await board(db, req.body.board_id);
    if (
      !['item.created', 'item.updated', 'status.changed', 'payment.created'].includes(
        req.body.event,
      )
    )
      fail('Unsupported trigger.');
    const action = req.body.action ?? {},
      condition = req.body.condition ?? {};
    if (!['notify', 'update', 'comment'].includes(action.type))
      fail('Choose notification, field update or comment.');
    if (JSON.stringify({ action, condition }).length > 10000) fail('Rule is too large.');
    if (
      action.user_id &&
      !(await db.get('SELECT id FROM users WHERE id=? AND active=1', [action.user_id]))
    )
      fail('Notification recipient unavailable.');
    const id = randomUUID();
    await db.tx(async (tx) => {
      await tx.run(
        'INSERT INTO p_rules(id,board_id,name,event,condition_json,action_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [
          id,
          req.body.board_id,
          name(req.body.name),
          req.body.event,
          JSON.stringify(condition),
          JSON.stringify(action),
          req.user.id,
          stamp(),
        ],
      );
      await audit(tx, req.user, 'automation_created', { id });
    });
    res.status(201).json({ id });
  });
  router.patch('/rules/:id', async (req, res) => {
    manager(req.user);
    if (!(await db.get('SELECT id FROM p_rules WHERE id=?', [req.params.id])))
      fail('Rule not found.', 404);
    await db.tx(async (tx) => {
      await tx.run('UPDATE p_rules SET enabled=? WHERE id=?', [
        req.body.enabled ? 1 : 0,
        req.params.id,
      ]);
      await audit(tx, req.user, 'automation_toggled', { id: req.params.id });
    });
    res.json({ ok: true });
  });
  router.post('/jobs/run', async (req, res) => {
    manager(req.user);
    res.json(await runJobs(db, 20));
  });
  router.get('/summary', async (req, res) => res.json(await workspaceSummary(db, req.user)));
  router.get('/profile', async (req, res) =>
    res.json({
      preferences: json(
        (await db.get('SELECT preferences FROM p_profiles WHERE user_id=?', [req.user.id]))
          ?.preferences ?? '{}',
      ),
    }),
  );
  router.put('/profile', async (req, res) => {
    const p = req.body.preferences ?? {};
    if (JSON.stringify(p).length > 12000) fail('Preferences too large.');
    await db.run(
      'INSERT INTO p_profiles(user_id,preferences) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences',
      [req.user.id, JSON.stringify(p)],
    );
    res.json({ ok: true });
  });
  router.get('/sessions', async (req, res) => {
    const rows = await db.all(
      'SELECT token,expires_at FROM sessions WHERE user_id=? AND expires_at>?',
      [req.user.id, stamp()],
    );
    res.json({
      sessions: rows.map((row) => ({
        id: row.token,
        expires_at: row.expires_at,
        current: row.token === req.session.token,
      })),
    });
  });
  router.delete('/sessions/:id', async (req, res) => {
    await db.run('DELETE FROM sessions WHERE token=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  });
  return router;
}
