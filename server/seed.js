import { randomUUID } from 'node:crypto';
import { passwordHash } from './domain.js';

export async function seedDatabase(db) {
  if (await db.get('SELECT id FROM users LIMIT 1')) return;
  const production = process.env.NODE_ENV === 'production';
  const demoMode = !production || process.env.DEMO_MODE === 'true';
  const password = process.env.SEED_ADMIN_PASSWORD ?? (demoMode ? 'Admin@123' : '');
  if (password.length < (demoMode ? 8 : 12))
    throw new Error('Set SEED_ADMIN_PASSWORD to at least 12 characters before the first startup.');
  if (production && !demoMode && ['RelayDemo!2026', 'Admin@123'].includes(password))
    throw new Error(
      'Choose a unique SEED_ADMIN_PASSWORD for production. Demo passwords are disabled.',
    );
  const demo = demoMode && process.env.SEED_DEMO !== 'false';
  const now = new Date().toISOString();
  await db.tx(async (tx) => {
    if (await tx.get('SELECT id FROM users LIMIT 1')) return;
    await tx.run('INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)', [
      'admin',
      demo ? 'Aarav Mehta' : 'Workspace Admin',
      String(process.env.SEED_ADMIN_EMAIL ?? 'admin@gmail.com')
        .trim()
        .toLowerCase(),
      passwordHash(password),
      'admin',
      now,
    ]);
    await tx.run('INSERT INTO settings(key,value) VALUES(?,?)', [
      'company_name',
      process.env.COMPANY_NAME ?? 'Relay Logistics',
    ]);
    await tx.run('INSERT INTO settings(key,value) VALUES(?,?)', ['note_minimum', '10']);
    if (!demo) return;
    const names = [
      'Priya Sharma',
      'Rahul Verma',
      'Ananya Singh',
      'Arjun Patel',
      'Neha Kapoor',
      'Vikram Rao',
      'Isha Gupta',
      'Rohan Das',
      'Meera Nair',
      'Kabir Shah',
    ];
    for (let i = 0; i < names.length; i++)
      await tx.run(
        'INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',
        [
          `agent-${i + 1}`,
          names[i],
          `user${i + 1}@gmail.com`,
          passwordHash(process.env.SEED_AGENT_PASSWORD ?? `user${i + 1}@123`),
          'agent',
          now,
        ],
      );
    const businesses = [
      'Apollo Care Hospital',
      'Bright Spark Electricals',
      'Nexus Industrial Supply',
      'Greenfield Contractors',
      'Sunrise Medical Centre',
      'Vertex Engineering',
      'Cityline Distributors',
      'Evergreen Diagnostics',
      'Bluepeak Enterprises',
      'Metro Electrical Works',
      'Oakwood Construction',
      'Prime Health Clinic',
      'Horizon Trading Co.',
      'Sterling Infrastructure',
      'Lifecare Hospital',
      'Apex Power Solutions',
      'Urban Build Partners',
      'Unity Surgical Centre',
      'Pioneer Hardware',
      'Northstar Logistics',
      'Shree Ganesh Traders',
      'Crescent Healthcare',
      'Truevolt Systems',
      'Summit Contractors',
    ];
    const categories = [
      'Hospitals',
      'Electricians',
      'B2B Contractors',
      'B2B Contractors',
      'Hospitals',
      'Electricians',
    ];
    const cities = ['Mumbai', 'Pune', 'Bengaluru', 'Delhi', 'Hyderabad', 'Ahmedabad'];
    const statuses = [
      'Pending',
      'Interested',
      'Callback Scheduled',
      'Pending',
      'Closed Won',
      'Not Interested',
      'Unanswered',
    ];
    for (let i = 0; i < 72; i++) {
      const id = `lead-${i + 1}`;
      const status = statuses[i % 7];
      const owner = i < 60 ? `agent-${(i % 10) + 1}` : null;
      const date = new Date(Date.now() - (i % 14) * 86400000 - 3600000).toISOString();
      const callback =
        status === 'Callback Scheduled'
          ? new Date(Date.now() + ((i % 5) - 1) * 86400000 + 3600000).toISOString()
          : null;
      await tx.run(
        'INSERT INTO leads(id,business,contact,phone,email,city,category,source,status,owner_id,callback_at,last_contact_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          businesses[i % 24] + (i >= 24 ? ` · ${cities[Math.floor(i / 24)]}` : ''),
          ['Aditya', 'Sanjay', 'Kavita', 'Rakesh'][i % 4],
          String(9000000000 + i),
          `contact${i + 1}@example.com`,
          cities[i % 6],
          categories[i % 6],
          ['Website', 'Referral', 'Business directory'][i % 3],
          status,
          owner,
          callback,
          status === 'Pending' ? null : date,
          date,
          date,
        ],
      );
      if (status !== 'Pending' && owner) {
        await tx.run(
          'INSERT INTO calls(id,lead_id,user_id,disposition,notes,duration,callback_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
          [
            randomUUID(),
            id,
            owner,
            status,
            status === 'Callback Scheduled'
              ? 'Prospect requested a follow-up to discuss requirements.'
              : status === 'Closed Won'
                ? 'Requirements confirmed and onboarding completed.'
                : 'Discussed service requirements with the business contact.',
            90 + ((i * 17) % 420),
            callback,
            date,
          ],
        );
      }
    }
  });
}
