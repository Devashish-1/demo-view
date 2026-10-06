import { randomUUID } from 'node:crypto';
import { stamp } from './domain.js';
const col = (name, type = 'text', config = {}) => ({ name, type, config });
export const templates = {
  custom: {
    name: 'Custom board',
    groups: ['New', 'In progress', 'Done'],
    columns: [
      col('Status', 'status', { options: ['New', 'In progress', 'Done'] }),
      col('Due date', 'date'),
      col('Priority', 'dropdown', { options: ['Low', 'Normal', 'High', 'Urgent'] }),
    ],
  },
  companies: {
    name: 'Companies',
    groups: ['Prospects', 'Customers', 'Partners'],
    columns: [
      col('Industry'),
      col('Website', 'url'),
      col('Email', 'email'),
      col('Phone', 'phone'),
      col('City'),
      col('Employees', 'number'),
      col('Revenue', 'currency', { currency: 'INR' }),
    ],
  },
  contacts: {
    name: 'Contacts',
    groups: ['Prospects', 'Active', 'Customers'],
    columns: [
      col('Email', 'email'),
      col('Phone', 'phone'),
      col('Job title'),
      col('Address', 'longtext'),
      col('Tags', 'text'),
    ],
  },
  deals: {
    name: 'Deals',
    groups: ['Lead', 'Qualified', 'Meeting', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    columns: [
      col('Value', 'currency', { currency: 'INR' }),
      col('Probability', 'percentage'),
      col('Expected close', 'date'),
      col('Source'),
      col('Priority', 'dropdown', { options: ['Low', 'Normal', 'High', 'Urgent'] }),
      col('Weighted value', 'formula', { expression: 'Value * Probability / 100' }),
    ],
  },
  tasks: {
    name: 'Tasks',
    groups: ['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'],
    columns: [
      col('Due date', 'date'),
      col('Priority', 'dropdown', { options: ['Low', 'Normal', 'High', 'Urgent'] }),
      col('Description', 'longtext'),
      col('Checklist', 'longtext'),
      col('Repeat', 'dropdown', { options: ['None', 'Daily', 'Weekly', 'Monthly'] }),
    ],
  },
  activities: {
    name: 'Activities',
    groups: ['Scheduled', 'Completed', 'Cancelled'],
    columns: [
      col('Type', 'dropdown', {
        options: ['Meeting', 'External call', 'Email log', 'Visit', 'Note', 'Follow-up'],
      }),
      col('When', 'datetime'),
      col('Duration minutes', 'number'),
      col('Notes', 'longtext'),
    ],
  },
  recovery: {
    name: 'Recovery cases',
    groups: [
      'New case',
      'Documents pending',
      'Assigned',
      'Contacted',
      'Negotiation',
      'Payment promised',
      'Partial payment',
      'Fully recovered',
      'Closed',
    ],
    columns: [
      col('Outstanding amount', 'currency', { currency: 'INR', required: true }),
      col('Currency', 'dropdown', { options: ['INR', 'USD', 'EUR', 'GBP'], required: true }),
      col('Invoice reference'),
      col('Due date', 'date'),
      col('Promise date', 'date'),
      col('Priority', 'dropdown', { options: ['Low', 'Normal', 'High', 'Urgent'] }),
      col('Notes', 'longtext'),
    ],
  },
  legal: {
    name: 'Legal cases',
    groups: ['Review', 'Filed', 'Hearing', 'Resolved', 'Closed'],
    columns: [
      col('Case reference'),
      col('Court'),
      col('Next hearing', 'date'),
      col('Notes', 'longtext'),
    ],
  },
};
export async function createBoard(tx, workspaceId, name, kind = 'custom', description = '') {
  const template = templates[kind];
  if (!template) throw new Error('Unknown board template');
  const id = randomUUID();
  await tx.run(
    'INSERT INTO p_boards(id,workspace_id,name,kind,description,created_at) VALUES(?,?,?,?,?,?)',
    [id, workspaceId, name, kind, description, stamp()],
  );
  for (const [position, label] of template.groups.entries())
    await tx.run('INSERT INTO p_groups(id,board_id,name,position) VALUES(?,?,?,?)', [
      randomUUID(),
      id,
      label,
      position,
    ]);
  for (const [position, column] of template.columns.entries())
    await tx.run(
      'INSERT INTO p_columns(id,board_id,name,type,config,position) VALUES(?,?,?,?,?,?)',
      [randomUUID(), id, column.name, column.type, JSON.stringify(column.config), position],
    );
  return id;
}
export async function bootstrapPlatform(db) {
  await db.tx(async (tx) => {
    if (await tx.get('SELECT id FROM p_workspaces LIMIT 1')) return;
    const sales = randomUUID(),
      recovery = randomUUID();
    await tx.run('INSERT INTO p_workspaces(id,name,created_at) VALUES(?,?,?)', [
      sales,
      'Sales & relationships',
      stamp(),
    ]);
    await tx.run('INSERT INTO p_workspaces(id,name,created_at) VALUES(?,?,?)', [
      recovery,
      'Recovery operations',
      stamp(),
    ]);
    for (const kind of ['companies', 'contacts', 'deals', 'tasks', 'activities'])
      await createBoard(tx, sales, templates[kind].name, kind);
    for (const kind of ['recovery', 'legal'])
      await createBoard(tx, recovery, templates[kind].name, kind);
  });
}
