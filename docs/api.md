# REST API

All endpoints are under `/api`. Send the `relay_session` cookie returned by sign-in. Authenticated POST/PATCH requests also require the `X-CSRF-Token` value returned by sign-in or `/auth/me`.

JSON errors have the form `{ "error": "Human-readable message" }`. Common codes: 400 validation, 401 unauthenticated, 403 unauthorized, 404 missing record, 409 duplicate/conflict, 429 throttled.

| Method | Path                    | Access / behavior                                                                      |
| ------ | ----------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/health`               | Public readiness response.                                                             |
| POST   | `/auth/login`           | `{email,password}` → user, CSRF, session cookie.                                       |
| GET    | `/auth/me`              | Current account and CSRF token.                                                        |
| POST   | `/auth/logout`          | Ends this session. Active work is retained.                                            |
| POST   | `/auth/password`        | `{current,password}`; at least 12 characters; ends other sessions.                     |
| POST   | `/presence`             | Updates last-seen timestamp.                                                           |
| GET    | `/events`               | Authenticated SSE stream; `refresh` invalidates client data.                           |
| GET    | `/meta`                 | Scoped filter values, user metadata, settings, current active work.                    |
| GET    | `/leads`                | Filtered/paginated lead directory.                                                     |
| POST   | `/leads/check`          | Live duplicate check; reveals only summary/owner/status/last-contact information.      |
| POST   | `/leads`                | Create validated lead. Agent-created leads belong to the creating agent.               |
| GET    | `/leads/:id`            | Authorized detail, activity history, and current active work.                          |
| PATCH  | `/leads/:id`            | Manager/admin edit. Refuses locked records.                                            |
| POST   | `/leads/:id/reveal`     | Atomically locks, audits, and returns the full phone.                                  |
| POST   | `/leads/:id/log`        | Validates and saves disposition/notes/duration/callback; unlocks.                      |
| GET    | `/callbacks`            | All callback leads within the user’s authorized scope.                                 |
| POST   | `/allocate`             | Manager/admin allocation or reallocation.                                              |
| POST   | `/work/:userId/release` | Manager/admin recovery with an audited reason.                                         |
| POST   | `/imports/preview`      | Manager/admin multipart `file`, 5 MB max; staged preview and mapping.                  |
| POST   | `/imports/:id/commit`   | Manager/admin `{mapping,policy}`; atomic and idempotent.                               |
| GET    | `/imports`              | Manager/admin recent import summaries.                                                 |
| GET    | `/users`                | Manager/admin team list and assignment counts.                                         |
| POST   | `/users`                | Create account; only admins can grant manager/admin roles.                             |
| PATCH  | `/users/:id`            | Manage active/available flags or reset password. Managers may manage agents only.      |
| PATCH  | `/settings`             | Manager/admin company name and minimum note length.                                    |
| GET    | `/analytics`            | Scoped metrics, trend, funnel, leaderboard, callbacks, sources, categories.            |
| GET    | `/reports`              | Scoped activity records (first 1,000) and full count.                                  |
| GET    | `/audit`                | Manager/admin paginated immutable audit log.                                           |
| GET    | `/export`               | Filtered CSV or XLSX download; scoped/masked for agents. Audit export is manager-only. |

## Lead schema

```json
{
  "business": "Example Freight",
  "contact": "Sample Contact",
  "phone": "+91 9876543210",
  "email": "contact@example.com",
  "city": "Mumbai",
  "category": "Logistics",
  "source": "Website",
  "allow_similar": false
}
```

Business, phone, and city are required. `allow_similar` is an explicit confirmation for a fuzzy manual-create match; it never bypasses phone/email uniqueness.

## Filters

Lead filters: `search`, `category`, `city`, `status`, `source`, `owner`, `from`, `to`, `page`, `size`, and `open=true`. `owner=unassigned` is supported for managers. Agents are always scoped to their own leads. Page size is 1–100, default 12.

Report filters: `from`, `to`, `owner`, `category`, `city`, and `status`. Dates use `YYYY-MM-DD` and UTC day boundaries. Activity reports filter activity timestamps; lead/pipeline aggregates filter lead creation dates. Export accepts `type=leads|calls|audit` and `format=csv|xlsx`. Audit export currently includes the full audit log.

Audit listing supports `user_id`, `action`, and `page`, with 30 entries per page.

## Log an activity

```json
{
  "disposition": "Callback Scheduled",
  "notes": "Prospect asked us to discuss the quotation tomorrow.",
  "duration": 180,
  "callback_at": "2026-10-04T05:00:00.000Z"
}
```

Allowed dispositions: Pending, Interested, Callback Scheduled, Not Interested, Unanswered, Closed Won. In Progress is set by revealing a contact. Notes must meet the configured minimum. Duration is an integer from 0 to 86,400 seconds. Callback Scheduled requires a future timestamp. Other dispositions clear the current callback while retaining history.

## Allocate

```json
{ "ids": ["lead-uuid"], "agent_id": "agent-uuid" }
```

Omit `agent_id` for round-robin. Omit `ids` to allocate all unassigned leads matching optional `category` and `city` filters. Selected batches allow up to 1,000 records. A selected active/locked record causes the entire assignment to fail without partial changes.

## Import commit

```json
{
  "mapping": { "business": "Org Name", "phone": "Mobile", "city": "City", "email": "Email" },
  "policy": "skip"
}
```

`policy` can be `skip` or `update`. The response contains inserted/updated/skipped/invalid counts and row-numbered issues. CSV row numbers include the header row. Similar businesses are always skipped for review; unambiguous exact matches can be updated. Completed commits return the same result when retried.
