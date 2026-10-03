# Architecture and invariants

## Runtime

React 19 and Vite build a static application served by Express 5. Authentication uses opaque, random session cookies; only SHA-256 hashes of session tokens are stored. Passwords use salted scrypt hashes. Session lifetime is 12 hours. Password reset/deactivation invalidates existing sessions.

The API reads the current user and role from the database for each request. It never trusts a role, owner, or user ID supplied by the browser as proof of authorization. Agents cannot list team accounts, import data, allocate leads, edit contact profiles, modify settings, or access audit exports. Agent lead access is limited by ownership in SQL and checked again on detail/mutation routes. Agent exports also mask phone numbers.

All writes require a per-session CSRF token and validated Origin when supplied. Cookies are HTTP-only and SameSite Strict, with Secure in production. Helmet sets browser security headers. SQL values use bound parameters. User text is rendered through React text nodes. CSV/Excel exports neutralize formula prefixes.

## Data model

- `users`: accounts, roles, active/available state, last seen, password hash.
- `sessions`: hashed token, user, CSRF value, expiry.
- `leads`: normalized phone identity, optional email, business metadata, one owner, current status/callback, timestamps.
- `active_work`: one primary-key user and one unique lead. This is the persistent workflow lock.
- `calls`: append-only activity history; manual talk time, disposition, notes, callback, actor and time.
- `audit`: append-only access/change trail. UPDATE and DELETE fail at the database layer.
- `imports`: bounded staged rows, filename, state, and row-level result. Staged rows are cleared after commit.
- `settings`: workspace name, mandatory note minimum, persistent round-robin cursor.

Phone is unique. Nonempty email is unique after lowercase normalization. Foreign keys prevent invalid owners and history references. The adapter uses integer flags for compatibility with both supported databases.

## Transaction boundaries

Every mutation runs inside `db.tx`.

- **SQLite:** a process queue plus `BEGIN IMMEDIATE` serializes writes; WAL allows reads. The database engine arbitrates other-process writers.
- **PostgreSQL:** a checked-out connection holds an advisory transaction lock until commit/rollback. Every app process uses the same lock key. The lock is intentionally coarse for a small calling team; it prioritizes correctness over large-scale write throughput.

Assignment selection and owner changes happen in one transaction. An active lead cannot be reallocated. Round-robin only includes active and available agent accounts. Logged-in presence is visible through `last_seen`; availability is explicitly managed by the manager and is not automatically removed merely because a tab closes.

## Reveal and mandatory logging

1. Authorize lead ownership.
2. Check the user has no different active lead.
3. Check no other user has locked this lead.
4. Insert `active_work`, retain the previous status, set In Progress, and append a contact-reveal audit event.
5. Return the complete contact number only after those steps succeed.

Opening a different lead’s detail is blocked for agents with active work. Another browser or session cannot bypass this guard because the lock is persistent. A valid activity log must contain a known disposition and the configured note minimum. A callback must be in the future. Saving inserts history, changes current status/callback, appends an audit event, and removes the active lock atomically.

Managers can release stranded work with a reason of at least ten characters. This restores the prior disposition and records an audit event; it does not invent a completed call.

## Deduplication

The supported phone format is an Indian mobile number normalized to ten digits; the country code is not silently stripped from arbitrary foreign numbers. Phone and nonempty email matches block manual creation. City comparison is case-insensitive. Business names are lowercased and stripped of punctuation/spacing; normalized Levenshtein distance at or below 18% flags a possible entity duplicate. Fuzzy matches are review signals and never automatically merged.

Import `skip` keeps existing data. Import `update` only merges an unambiguous exact phone/email match. If the two identities point to different records, the row is skipped with a review reason. Blank columns retain existing values. Contact details can change, but ownership, status, callbacks, notes, and activity history do not. Active records are skipped to avoid changing a contact during an agent’s work.

Each commit is atomic, and repeating a completed import ID returns its prior result. File parsing runs in a worker thread with a 256 MB heap cap and a 20-second deadline. Files are bounded at 5 MB; row and column caps prevent accidental oversized imports. Database matching runs in the API transaction. Larger ingestion volumes warrant a durable job queue and independently scalable workers.

## Analytics definitions

- **Activities / attempted:** number of manually saved activity records in the filter range.
- **Connected:** Interested, Callback Scheduled, or Closed Won activity records.
- **Connect rate:** connected / attempted, zero when no activities exist.
- **Unique conversions:** distinct leads with a Closed Won activity in the selected period.
- **Conversion rate:** unique converted leads / distinct contacted leads in that period.
- **Talk time:** sum of manually entered seconds.
- **Pipeline/category/source:** current disposition of leads whose creation dates match the lead filters.

Historical conversion counts can therefore differ from the current pipeline after a lead is reopened, reassigned, or filtered by creation date. Agent activity reports attribute work to the person who logged it; owned lead views follow current ownership.

## Operations

Use one API instance for the default deployment. It emits data-free refresh notifications over authenticated SSE. Clients refetch scoped data. A one-minute reconciliation refresh keeps overdue reminders and multi-process changes current. For a large deployment, add shared pub/sub, shared rate-limit storage, pagination for large aggregate reports, durable background ingestion jobs, and monitoring appropriate to the environment.

Production requires HTTPS, a unique first-run admin password, an appropriate trusted-proxy configuration, and regular database backups. Credentials remain server-side. There are no external calling or SMS credentials in this scope.

The PostgreSQL schema adapter and Compose configuration are supplied but were not exercised against a live PostgreSQL server during this build because the installed Docker daemon was unavailable. SQLite automated and browser tests verify the local deliverable.
