# Plan: Plans + Subscribe (Milestone 1)

**Source PRD**: docs/prd/hulog.prd.md
**Selected Milestone**: 1. Plans + Subscribe
**Complexity**: Medium

## Summary
A broker lists a unit; Hulog creates a PayPal Catalog Product and a Billing Plan for it. A buyer opens the unit's pay page, subscribes with a sandbox PayPal account, and lands on a page showing the subscription status from PayPal (ACTIVE).

## Decisions
- **No database yet.** PayPal is the source of truth for products, plans and subscriptions, so pages read them from the API. Postgres arrives in milestone 2 with the payment ledger.
- **JS SDK v5 for the Subscribe button.** PayPal's Subscriptions guide documents v5 (`paypal.Buttons` + `createSubscription`); no v6 subscription API was found.
- **Server Action instead of `POST /api/units`.** Same behaviour, fewer files, and Next.js checks the request Origin (CSRF protection) for free.
- **Billing interval:** `DAY` when `DEMO_MODE=true` (so payments can be watched in a demo), `MONTH` otherwise.
- Buyer page is keyed by PayPal subscription ID for now; milestone 2 maps it to a Contract.

## Patterns to Mirror
No app code exists yet. Tests: Vitest, `*.test.ts` next to the module, relative imports.

## Files to Change
| File | Action | Why |
|---|---|---|
| `lib/unit.ts` + test | CREATE | Validate broker input; ID format checks |
| `lib/paypal.ts` + test | CREATE | OAuth token (cached), product/plan/subscription calls |
| `app/broker/page.tsx`, `actions.ts`, `new-unit-form.tsx` | CREATE | List plans, create a unit |
| `app/pay/[planId]/page.tsx`, `subscribe-button.tsx` | CREATE | Plan details + PayPal Subscribe button |
| `app/buyer/[subscriptionId]/page.tsx` | CREATE | Subscription status from PayPal |
| `app/page.tsx` | UPDATE | Link to the broker page |

## Validation
```powershell
npm test
npm run build
npm run dev   # then: create a unit at /broker, subscribe at /pay/<planId> with the sandbox buyer
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| PHP not accepted for sandbox plans | Medium | Currency is a form field; fall back to USD |
| Untrusted IDs in URLs reach PayPal API paths | Medium | Strict ID regex before any API call |
| PayPal errors leak details to users | Low | Generic message to the client; `debug_id` logged server-side |
| Broker page has no auth | Accepted | Sandbox-only demo; login is out of scope in the PRD |

## Acceptance
- [ ] Creating a unit makes a real sandbox plan
- [ ] Sandbox buyer subscribes and sees ACTIVE
- [ ] Tests and build pass
