# Platform REST API

Base path: `/api/platform`. All endpoints require the existing `relay_session` cookie. Mutations also require `X-CSRF-Token`. Login accepts `{email,password,organization}` at `/api/auth/login`; `organization` defaults to `default`. The authenticated session resolves the tenant. Never send an organization ID to select data.

Errors use `{error: "message"}` and HTTP 400/401/403/404/409/429/500. No raw stack trace is returned. JSON bodies are limited to 1 MB.

| Method         | Path                                     | Behavior                                                                                     |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET            | `/bootstrap`                             | Current organization, workspaces, boards, users, field types, templates and capability flags |
| POST           | `/organizations`                         | Admin: `{name,slug,admin_name,email,password}`; password minimum 12 characters               |
| POST / PATCH   | `/workspaces`, `/workspaces/:id`         | Manager: create; rename/archive                                                              |
| POST           | `/boards`                                | Manager: `{workspace_id,name,kind,description}`                                              |
| GET / PATCH    | `/boards/:id`                            | Schema/groups/views; manager rename/archive                                                  |
| POST / PATCH   | `/boards/:id/groups`, `/groups/:id`      | Manager group configuration                                                                  |
| POST           | `/boards/:id/columns`                    | Manager `{name,type,config}` custom field                                                    |
| GET / POST     | `/boards/:id/items`                      | Scoped paging/query; create record                                                           |
| GET / PATCH    | `/items/:id`                             | Scoped details/relations/comments/payments; validated optimistic edit                        |
| POST           | `/boards/:id/bulk`                       | Manager `{ids,action,confirm,...}` assignment, move or archive                               |
| GET            | `/archive`                               | Manager: up to 500 archived records/boards/workspaces                                        |
| POST           | `/archive/:kind/:id/restore`             | Manager; kind record/board/workspace                                                         |
| POST / DELETE  | `/items/:id/relations`, `/relations/:id` | Link accessible records; unlink relation                                                     |
| POST           | `/items/:id/comments`                    | Comment with optional parent/mentions                                                        |
| PATCH / DELETE | `/comments/:id`                          | Edit own comment; soft remove own (admin may remove others)                                  |
| POST           | `/items/:id/payments`                    | Manager: received-payment ledger entry                                                       |
| POST / DELETE  | `/boards/:id/views`, `/views/:id`        | Save personal/shared view; remove permitted view                                             |
| GET            | `/notifications`                         | Current user's inbox                                                                         |
| POST           | `/notifications/read`                    | Mark own inbox read                                                                          |
| GET            | `/search?q=...`                          | Scoped record-name search                                                                    |
| GET            | `/boards/:id/export`                     | CSV, same filters, maximum 200 rows; phone masking applies                                   |
| POST           | `/boards/:id/import`                     | Manager `{rows:[...]}`; 1–200 atomic mapped records                                          |
| POST           | `/leads/:id/convert`                     | Manager; idempotent lead→company/contact/deal links                                          |
| GET / POST     | `/rules`                                 | Manager automation rules/logs; create rule                                                   |
| PATCH          | `/rules/:id`                             | Manager enable/disable                                                                       |
| POST           | `/jobs/run`                              | Manager drain due jobs in this organization                                                  |
| GET            | `/summary`                               | Scoped counts, currency-separated recovery balances, aging                                   |
| GET / PUT      | `/profile`                               | Own JSON preferences                                                                         |
| GET / DELETE   | `/sessions`, `/sessions/:id`             | Own sessions and revocation                                                                  |

## Record payload

```json
{
  "name": "Renewal discussion",
  "group_id": "group-id-from-board",
  "owner_id": "active-user-id",
  "values": { "field-id-from-board": 25000 },
  "version": 3
}
```

Creation does not require `version`; updates should include the version returned by the API to receive HTTP 409 on stale edits. A subitem uses `parent_id` on creation. Only one nested level is supported. Relations require access to both records. Agents cannot change owner, masked phone data or recovery principal/currency.

List parameters: `search`, `group`, `owner`, `sort` (`name`, `created_at`, `updated_at`), `page`, `limit` (maximum 200), `filter` (JSON). A nested filter uses `{op:"AND"|"OR",conditions:[...]}`; a condition uses `{field,op,value}`. Operators: equals, not_equals, contains, greater, less, empty, not_empty. Field IDs must belong to the board; formula and masked phone filtering are restricted.

## Payment payload

```json
{
  "amount": "1250.50",
  "reference": "Receipt 123",
  "paid_at": "2026-10-06T09:00:00Z",
  "idempotency_key": "unique-payment-request-id"
}
```

Currency comes from the case. Reusing a key returns the existing matching payment; a conflicting case/amount returns 409. No more than two decimal places, positive amounts only, no future payments, no amount greater than pending balance. This records a payment; it does not initiate a transfer.

## Automation payload

```json
{
  "board_id": "board-id",
  "name": "Notify owner",
  "event": "item.created",
  "condition": {},
  "action": { "type": "notify", "message": "Please review this record" }
}
```

Events: `item.created`, `item.updated`, `status.changed`, `payment.created`. Actions: `notify` (`user_id` optional, defaults to owner), `comment` (`message`), `update` (`changes` record patch). A rule's creator must remain active with manager/admin access. Generated writes do not recursively trigger rules. Jobs are idempotent per rule/item/event version and stop after three failed attempts.

Public API keys, OAuth and outgoing webhooks are not enabled. These are the authenticated first-party APIs; do not expose a session cookie as a third-party integration credential.
