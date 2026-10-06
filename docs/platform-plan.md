# Relay platform expansion

The October 6 requirements extend the existing lead CRM, rather than replace it.
Keep imported leads, activity locks, masked agent contacts, callback scheduling,
audit records, existing logins, and the Vercel/PostgreSQL deployment.

## Delivery order

1. Isolated organization databases, server-resolved session routing, migrations.
2. Workspaces and metadata-driven boards with groups, typed fields, records,
   subitems, relationships, saved views, filtering, formulas and permission checks.
3. Company/contact/deal/task/recovery templates, lead conversion, payments and
   transactionally derived recovery balances.
4. Table/Kanban/calendar/timeline views, record details, comments, notifications,
   search, dashboards and exports.
5. Durable automation jobs with execution history and bounded retries.
6. Tests, documentation, existing workflow regression checks and hosted verification.

AI and telephony remain explicitly Coming soon, per the user's instructions.
Provider-dependent email, object storage, OAuth and messaging integrations must
remain clearly unavailable until their providers are configured and tested.
Public signup is disabled by default: organization provisioning is an authenticated
administrator operation. A provisioned organization has its own administrator and
isolated records, including the legacy lead/calling workflow.

No SLA, compliance certification, million-record performance claim, or completed
enterprise feature claim is implied by this implementation. Document remaining
requirements against the original 75-section request instead of hiding them.
