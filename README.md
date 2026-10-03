# Relay CRM

A complete local lead-management and telecaller workflow application, built from the supplied **Lead Management & Calling CRM — PRD & System Design**.

**Scope update:** Browser calling, Twilio, automatic SMS, and inbound call pop-ups are future scope. The application shows a **Coming soon** page for these features. There is no telephony SDK, dialing endpoint, SMS sender, or telephony credential requirement. Agents call externally and record outcomes in Relay.

## Start here

Requirements: **Node.js 24 or later** and npm.

```powershell
cd C:\Users\user\Desktop\logistics
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4000**. You can also double-click `start.cmd`; it installs missing dependencies, builds, and starts the app.

For development with automatic reload:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. The Vite development server proxies API requests to port 4000. Run either `npm start` or `npm run dev` at a time, since both use the same API port.

### Local demo accounts

| Role          | Email                                        | Password    |
| ------------- | -------------------------------------------- | ----------- |
| Administrator | `admin@gmail.com`                            | `Admin@123` |
| Agent / Priya | `user1@gmail.com`                            | `user1@123` |
| Other agents  | `user2@gmail.com` through `user10@gmail.com` | `user2@123` through `user10@123` |

An empty development database is seeded with 72 synthetic leads, 10 agents, and sample activity. Browser verification may add clearly marked demo records. Seed data is inserted **only once**; restarts retain your changes. These are demo contact details; the app never calls or messages them.

### A clean workspace

Copy `.env.example` to `.env`. Set `SEED_DEMO=false`, choose a new `SQLITE_PATH` (for example `data/my-company.db`), and set `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` before starting. Using a new database path preserves the existing demo database. Changing seed variables does not alter accounts that already exist.

## Included features

- **Authentication:** Password hashing with scrypt, persistent server-side sessions, HTTP-only cookies, CSRF protection, request throttling, and server-enforced administrator/manager/agent permissions.
- **Lead directory:** Create and edit leads, search, category/city/status/owner filters, pagination, multi-select assignment, and CSV/Excel exports.
- **Live duplicate checks:** A normalized 10-digit Indian mobile number is the primary unique identity. Email matches are case-insensitive. Similar business names in the same city prompt review before manual creation.
- **CSV, XLSX, and XLS import:** Automatic header matching, editable column mapping, preview, skip/update policies, per-row issue reports, import history, and idempotent commits. Parsing runs in a separate worker with a timeout and memory limit.
- **Safe duplicate updates:** Existing notes, call history, status, callbacks, and ownership are preserved. Blank source fields never erase existing details. Ambiguous matches are held for manual review.
- **Allocation:** Round-robin among active, available agents; direct assignment; category/city batches; and selected-lead reallocation. The cursor persists between batches.
- **Agent workspace:** Assigned leads only, server-masked phone numbers, explicit audited reveal, one active lead per agent, and mandatory disposition plus notes before moving on. The lock survives refreshes, logouts, and server restarts.
- **Manual activity history:** Outcome, notes, duration, agent, timestamp, and optional callback. Note minimum is configurable from 10 to 500 characters.
- **Callbacks:** Calendar, upcoming/overdue agenda, quick scheduling, reminders, and links back to the lead.
- **Analytics:** Attempt volume, connected activities, connect rate, unique conversions, talk time, team productivity, current pipeline, category performance, and source performance. Agents receive personal analytics.
- **Audit trail:** Contact reveals, assignments, exports, imports, user changes, and configuration changes. Entries include user, lead, IP, and UTC timestamp. Database triggers prevent updates and deletes.
- **Team administration:** Create accounts, choose roles, manage availability, deactivate accounts, reset passwords, and release interrupted work with a mandatory audited reason.
- **Responsive interface:** Desktop and mobile navigation, accessible form labels, keyboard focus handling in dialogs, locally bundled fonts, and real-time refresh through Server-Sent Events.

## Workflow

1. Sign in as the administrator and import `samples/leads.csv` to exercise mapping and duplicate handling. It deliberately contains two valid businesses, a duplicate, and an invalid phone number.
2. Open **All leads**, select records, and choose **Assign selected**. Or choose **Auto-assign unassigned** for round-robin distribution.
3. Sign in as an assigned agent. Open **My workspace** and choose **Start next lead**.
4. Select **Reveal & start**. The full contact becomes available and an audited activity opens. Make the call outside Relay.
5. Record the disposition, meaningful notes, and talk time. A callback disposition requires a future date/time. Save the activity to release the lock.
6. Review **Callbacks**, **Reports & analytics**, and **Audit trail**.

## Configuration

`.env` is optional for the local demo. Copy `.env.example` to configure a workspace.

| Variable              | Purpose                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| `PORT`, `HOST`        | API/static server address. Default: `127.0.0.1:4000`.                                   |
| `APP_URL`             | Exact browser origin for write requests. Required to match your production HTTPS URL.   |
| `DATABASE_URL`        | PostgreSQL connection string. Leave empty to use SQLite.                                |
| `SQLITE_PATH`         | SQLite file location; default `data/relay.db`.                                          |
| `SEED_DEMO`           | Seed sample data in development only. `false` starts with an admin and no sample leads. |
| `SEED_ADMIN_EMAIL`    | Initial administrator email; default `admin@gmail.com`.                                 |
| `SEED_ADMIN_PASSWORD` | Initial admin password; at least 12 characters. Required in production.                 |
| `SEED_AGENT_PASSWORD` | Password for the development demo agents.                                               |
| `COMPANY_NAME`        | Initial workspace name; editable in Settings after startup.                             |
| `NODE_ENV`            | `production` enables secure cookies and disables demo seeding.                          |
| `TRUST_PROXY`         | Explicit trusted reverse proxy, if applicable. Leave empty without a proxy.             |

## Database and deployment

Local development uses SQLite with WAL, foreign keys, unique indexes, and transactions. Data is stored in `data/relay.db`, outside the frontend build. PostgreSQL uses the same relational schema through the `pg` adapter. Transaction-scoped PostgreSQL advisory locks serialize allocation, import commits, and reveal operations across API processes. A separate Redis service is not required for this team-sized deployment.

To run against an existing PostgreSQL database, set `DATABASE_URL` before starting. Schema creation is automatic. This selects a different database; it does **not** migrate existing SQLite data.

`Dockerfile` and `compose.yaml` provide an app + PostgreSQL deployment. Set `POSTGRES_PASSWORD` to a URL-safe random value, `SEED_ADMIN_PASSWORD` to a unique password, and `APP_URL` to your HTTPS origin in `.env`, then run:

```powershell
docker compose up --build -d
```

The app port is bound to loopback. Put an HTTPS reverse proxy in front of it. Production cookies are secure and therefore require HTTPS in the browser. Set `TRUST_PROXY` to the actual trusted proxy address/range, and forward the original client IP. No cloud deployment is performed by this project.

The local SQLite build is exercised by the automated tests. The PostgreSQL adapter and Docker configuration are included, but their runtime verification requires a running Docker/PostgreSQL service; Docker Desktop was not running during this build.

### Backups

```powershell
npm run backup
```

This creates a consistent SQLite backup in `data/backups`, including users, leads, history, assignments, audit records, and settings. To restore without overwriting another database, point `SQLITE_PATH` at a copy of the backup and restart. Back up PostgreSQL with `pg_dump` and your normal database backup policy.

## Verification

```powershell
npm test
npm run build
# Both:
npm run check
# Source formatting:
npm run format:check
```

Tests cover identity normalization, fuzzy matching, password verification, roles, CSRF/origin checks, ownership, masking, persistent anti-skipping locks, simultaneous reveals, mandatory notes, future callback validation, immutable audit entries, import formats, duplicate policies, ambiguous matches, round-robin allocation, scoped exports, password changes, account deactivation, and transaction rollback.

## Project layout

```text
src/main.jsx             React screens, forms, charts, and API client
src/styles.css           Responsive visual system
src/accessibility.css    Text contrast and readability refinements
server/app.js            Authenticated REST API, imports, allocation, and reports
server/db.js             SQLite/PostgreSQL adapter, schema, indexes, and audit triggers
server/domain.js         Validation, normalization, fuzzy matching, and password hashing
server/parse-worker.js   Isolated spreadsheet parsing
server/seed.js           First-run accounts and synthetic demo data
tests/                  Domain and HTTP integration tests
scripts/backup.js        Consistent local database backup
samples/leads.csv        Import workflow example
docs/architecture.md     Design choices, invariants, and deployment boundaries
docs/api.md              API reference
```

## Defined boundaries

- Phone normalization currently supports **Indian mobile numbers**: ten digits beginning with 6–9, optionally prefixed with `+91` or `0`. Foreign numbers and landlines are rejected rather than truncated incorrectly.
- Imports are limited to **5 MB, 10,000 rows, and 50 columns**. For Excel, the first worksheet is imported. Split larger files into batches. This is a bounded import workflow, not an unlimited background ingestion service.
- The calling integration, automatic SMS, voicemail detection, and inbound pop-ups are intentionally **Coming soon**. Call duration is manually entered.
- Reports use UTC date boundaries; callback displays and scheduling use the browser’s local timezone. The chart shows the latest 14 UTC dates. Activity rows on screen are capped at 1,000; exports contain the complete filtered report.
- Notifications are in-app while the workspace is open. There is no email/SMS reminder service.
- Audit immutability is enforced by the application and database triggers. A database superuser can alter schema and triggers; this is not external WORM storage.
- Live refresh is immediate within one API process and reconciled every minute across processes. A larger multi-instance installation can add a shared event bus and shared rate-limit storage.

Parser installation follows the official [SheetJS Node.js distribution instructions](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
