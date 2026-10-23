# Plan: Payment Ledger (Milestone 2)

**Source PRD**: docs/prd/hulog.prd.md
**Selected Milestone**: 2. Payment ledger
**Complexity**: Medium

## Summary
PayPal posts subscription and payment events to `POST /api/webhooks/paypal`. Hulog asks PayPal to verify each event's signature, then stores it once in Postgres (Neon). The buyer page shows that subscription's payment history; the broker page shows recent payments across all units.

## Decisions
- **One table, `payment_events`, keyed by PayPal's event ID.** PayPal retries a webhook until it gets a 2xx, so the same event can arrive more than once. The primary key plus `on conflict do nothing` makes storing it idempotent.
- **Verify with PayPal's `verify-webhook-signature` API** instead of checking the certificate chain ourselves. Less crypto code to get wrong. The raw request body is passed through unchanged, because re-serialising the JSON can change it and break verification.
- **Store every verified event, raw JSON included.** Milestone 3 (Maceda engine) needs failure and suspension events too, and the raw payload is the audit trail.
- **Neon's HTTP driver (`@neondatabase/serverless`).** One HTTPS request per query, so the app holds no connection pool open while Render's free tier sleeps.
- **Migration runs in Render's build command** (`create table if not exists`), so a deploy can't run against a missing table.
- Handler logic lives in `lib/webhook.ts` and the route file stays thin, so it can be tested without a server.

## Files to Change
| File | Action | Why |
|---|---|---|
| `db/schema.sql`, `scripts/migrate.mjs` | CREATE | Table + idempotent migration |
| `lib/db.ts` | CREATE | Neon client and ledger queries |
| `lib/paypal.ts` + test | UPDATE | `verifyWebhook()` |
| `lib/webhook.ts` + test | CREATE | Verify, map event to ledger row, store |
| `app/api/webhooks/paypal/route.ts` | CREATE | Public endpoint |
| `app/buyer/[subscriptionId]/page.tsx` | UPDATE | Payment history |
| `app/broker/page.tsx` | UPDATE | Recent payments table |
| `render.yaml`, `package.json` | UPDATE | Migrate on build, add driver |

## Validation
```powershell
npm test
npm run build
```
Then on Render: subscribe with the sandbox buyer and check the buyer page lists the payment.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Forged webhook ("payment completed") | High if unchecked | Reject unless PayPal returns `SUCCESS`; nothing is stored before that |
| Duplicate deliveries double-count payments | High | Event ID primary key |
| Dashboard simulator events fail verification | Known | Test with a real daily sandbox subscription instead |
| Oversized request bodies | Low | Reject bodies over 64 KB before parsing |
| Ledger page leaks other buyers' payments | Accepted | Broker page has no auth (sandbox demo, PRD scope) |

## Acceptance
- [ ] Unverified events get 400 and are not stored
- [ ] A repeated event is stored once
- [ ] A real sandbox payment shows on the buyer and broker pages
