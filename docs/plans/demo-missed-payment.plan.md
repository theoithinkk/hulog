# Plan: Simulate a Missed Payment (Milestone 5, first slice)

**Source PRD**: docs/prd/hulog.prd.md
**Selected Milestone**: 5. Demo-ready (one-click "simulate missed payment")
**Complexity**: Small

## Summary
PayPal sandbox can't fail a payment on cue, and simulator webhooks fail signature verification by design. So the demo's key moment, "a payment fails and the buyer sees their rights", can't happen live. When `DEMO_MODE=true`, the buyer page gets two buttons: **Simulate a missed payment**, which adds a clearly marked fake failed-payment row to the ledger, and **Reset demo**, which removes the fake rows.

## Decisions
- **Fake rows go in the real ledger, clearly marked.** `event_id` starts with `DEMO-` and `raw` is `{"demo": true}`. The rights section then runs the exact same code path as a real failure, so the demo shows the real behavior.
- **The webhook path is untouched.** Simulation is a server action that writes directly, behind `DEMO_MODE`. Verification of real PayPal events stays strict.
- **The PayPal cross-check is skipped only for demo rows.** Milestone 3 counts a payment as missed only if PayPal also shows money owed. A simulated miss can't change PayPal's balance, so a latest-event demo failure counts on its own.
- **Reset deletes only `DEMO-` rows.** Real events stay append-only. Deleting fake rows doesn't break the audit trail, because they never recorded anything real.
- **Labelled everywhere.** History and the broker table show "(simulated)" on demo rows.

## Files to Change
| File | Action | Why |
|---|---|---|
| `lib/demo.ts` + test | CREATE | Build demo rows, label them, decide "behind" with the demo exception |
| `lib/db.ts` | UPDATE | `deleteDemoEvents()` |
| `app/buyer/[subscriptionId]/actions.ts` | CREATE | Server actions behind `DEMO_MODE` |
| `app/buyer/[subscriptionId]/page.tsx` | UPDATE | Buttons; demo-aware "behind" check; labels |
| `app/broker/page.tsx` | UPDATE | "(simulated)" label |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Anyone with a subscription ID can mark it missed while `DEMO_MODE` is on | Accepted | Sandbox demo; rows are labelled; rate limited; Reset undoes it |
| Demo rows confused with real ones | Low | `DEMO-` prefix, `raw.demo`, visible label |
| `DEMO_MODE` left on in production | Low | PRD rules out production; the actions refuse when it's off |

## Acceptance
- [ ] Clicking Simulate shows "Payment failed (simulated)" and the missed-payment rights message, in EN and FIL
- [ ] Reset returns the page to "up to date"
- [ ] With `DEMO_MODE` off, the buttons don't render and the actions refuse
