# Relay workspace expansion

## Use the new workspace

Sign in with the existing account and open **CRM & boards**. The original lead directory, imports, contact locks, callbacks, team management and reports remain available in the sidebar. Existing lead data is not replaced.

1. Open Companies, Contacts, Deals, Tasks, Activities, Recovery cases or Legal cases. Boards initially contain no fabricated business totals.
2. Create a record, choose its group and owner, and enter typed fields. Administrators/managers can create boards, groups, custom fields and workspaces.
3. Switch between table, draggable Kanban, month calendar and date-ordered timeline. These show the current filtered page (50 records); use paging for more results. Save a personal or shared view, including filters and hidden columns.
4. Open a record to edit it, add notes and mentions, create one level of subitems, and link related records. Links enforce both records' access scope.
5. On a legacy lead, choose **Convert to CRM** to create linked company/contact/deal records. Repeating conversion returns the original result and preserves the lead's activity history.
6. For a recovery case, enter the original outstanding amount and currency. A manager records payments already received; Relay does not transfer money. Pending and recovered balances derive from the payment ledger. Partial/full payments update the group. Overpayment and unpaid closure are rejected.
7. Create a **When → If → Then** automation. Supported events are creation, update, group change and payment. Actions notify an accessible teammate, update fields/group, or add a comment. Generated changes do not recurse into more rules.
8. Use Inbox for assignments, mentions and automation messages; Insights for live counts, currency-separated recovery totals and case aging.
9. Import CSV or JSON using column mapping and a ten-row preview. A batch contains 1–200 records and commits atomically; validation failure saves none. This creates new records, so do not resubmit a successful batch. The original lead import retains its duplicate detection and CSV/XLSX/XLS support.
10. Archive selected records in a board. A manager can restore them in Workspace settings → Archive. Restore a parent workspace/board/record before its children.

Agents see their own/assigned records. They cannot manage schema, rules, payments or reassignment; phone fields stay masked. Financial principal/currency changes require a manager. Existing lead reveal remains the route for audited phone access.

## Organizations and authentication

Existing accounts use the **default** organization code. An administrator can provision another organization under Workspace settings. Sign out and enter its code and new administrator credentials to access it. Each organization has its own users, leads, boards, payments and jobs. A client header or query parameter cannot override the session's organization.

Session/device management lists active sessions and lets each user revoke their other sessions. User account administration and password changes remain in the original CRM. Login/logout and platform mutations append audit entries.

## Architecture and migrations

React/Vite uses reusable platform components under `src/platform`. Express routes under `/api/platform` call a store/domain layer. Custom fields are metadata plus JSON values, not one physical SQL column per custom field. Formulas use a bounded parser without JavaScript evaluation. Filters compile validated fields/operators to parameterized SQL.

The existing database remains the default organization. Additional organizations use server-generated `org_<uuid>` table namespaces. A server-owned organization directory resolves hashed session tokens to namespaces. The rewrite whitelist covers both legacy and platform tables, indexes and audit triggers. No user-controlled namespace is accepted. SQLite and PostgreSQL share the migration interface.

Migrations create `p_workspaces`, `p_boards`, `p_groups`, `p_columns`, `p_items`, `p_views`, `p_relations`, `p_comments`, `p_payments`, `p_notifications`, `p_rules`, `p_jobs`, `p_runs`, `p_profiles`, `p_conversion` and future dashboard metadata. Startup applies additive idempotent schema creation and creates templates only if missing. Back up the database before upgrading; `npm run backup` supports the local SQLite database. PostgreSQL backups and restore retention must be configured with the provider.

Every financial mutation and automation action is transactional. Payments use integer minor units and idempotency keys. Record edits accept a version and reject stale changes with HTTP 409. PostgreSQL transactions use an advisory lock; this favors correctness for a small team over high write throughput. Physical namespaces share a database role and are not a substitute for separate database credentials or PostgreSQL row-level security.

## Background execution

`npm start` drains each organization's queue every 15 seconds. Hosted Vercel mutations schedule a bounded drain through `@vercel/functions` `waitUntil`; jobs remain in the database if a process stops. A job retries with backoff and becomes dead after three failures. Administrators can inspect logs and manually process due jobs.

Run `node scripts/process-jobs.js` using the same securely configured `DATABASE_URL` to drain all organizations. Schedule this command when guaranteed retries without user traffic are required. No unattended external scheduler is provisioned by this release. Never put the database URL in a public browser or repository.

## Validation and current limits

`npm run check` runs the unit/integration suite and production build. Platform tests cover formula safety, assignment/phone boundaries, optimistic versions, conversion, payment consistency/concurrency, automation idempotency, organization isolation, exact financial aggregation, month-end recurrence and archive restoration. Existing lead regressions remain in the same suite.

This release implements the core platform from the supplied 75-section brief; it does **not** complete every enterprise requirement in that brief. Remaining work is explicit:

- AI and live calling/SMS are **Coming soon by the user's request**.
- Email/calendar provider sync, secure object-storage attachments, OAuth/MFA and outgoing webhooks are unavailable and labeled Coming soon.
- Public self-registration, email invitations/verification/reset delivery, customizable permission matrices/teams and board-level membership are not implemented. Access uses the existing admin/manager/agent roles and record ownership.
- Configurable drag/resize dashboards, form views, day/week calendars, dependency/mirror/file columns and large asynchronous imports/exports remain work items. Current insights, formula fields, relationships, table/Kanban/month/timeline views and CSV export are functional.
- Search is scoped name matching, not full-text indexing of notes/files. Board exports are limited to 200 filtered records; no silent truncation is presented as a full export.
- Subscription billing, a separate platform-admin console, retention/deletion policies and enterprise performance/compliance certification remain work items. No certified enterprise or million-record claim is made.
- Namespace caches currently have no eviction, transactions serialize writes, and per-organization pools are bounded at four connections. Load-test and revise pooling/isolation before onboarding many companies.


## Hosted verification — 6 October 2026

The Vercel preview and production deployment use PostgreSQL. Production smoke checks passed for both administrator and agent login, seven template boards, health/readiness, summary queries, deferred AI/calling flags and authorization (agents receive 403 for automation management). The original 72 demo leads remained; user1 sees six assigned leads.

Browser checks verified a synthetic recovery case, a 250 INR ledger entry against a 1,000 INR original balance, and matching 750 INR pending totals in Insights. A narrowly scoped automation added a comment automatically using Vercel background execution; its run was recorded as Success and the verification rule was paused afterward. The clearly named verification records remain demo data. The local unit/integration suite passed 32 tests and the production build completed successfully.
