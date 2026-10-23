# Plan: Rights on Failure (Milestone 3)

**Source PRD**: docs/prd/hulog.prd.md
**Selected Milestone**: 3. Rights on failure
**Complexity**: Medium

## Summary
The buyer page gets a "Your rights" section. When the latest ledger event is a failed payment (or a suspension), it explains the buyer's Maceda Law (RA 6552) rights for that missed installment. Otherwise it shows what would apply if the next installment were missed. Every legal number comes from a deterministic engine; Claude only writes the plain-language paragraph around them, in English or Filipino.

## Decisions
- **"The AI explains, code calculates."** `lib/maceda.ts` computes the grace period end date, refund (cash surrender value) and percentage. The page renders those facts itself, so they're correct even if the AI text is wrong.
- **Number guardrail.** The AI's paragraph is rejected, and the fixed template shown instead, if it contains any number that isn't in the facts it was given. It fails closed: a false reject only costs some warmth, never correctness.
- **Templates are the baseline.** With no API key, a timeout, or a refusal, the buyer still gets a correct template message. AI is an enhancement, not a dependency.
- **Model:** `claude-haiku-5-5` through the Anthropic SDK at `effort: "low"`: a few sentences from given facts don't need a bigger model, at about 1/40th of Opus's price. Haiku has no server-side fallback, so a refusal shows the template. 15 s timeout, no retries.
- **Cached per subscription, due date and language** (`unstable_cache`, 1 hour), so reloading the page doesn't call the model again.
- **Installments as months.** Maceda counts years of installments, so years paid = installments paid / 12. In demo mode (daily billing) each charge stands in for one monthly installment.
- **Total paid = installments paid x plan price.** PayPal is the source; down payments made outside PayPal aren't tracked yet.

## Engine rules (for Juvy's review: docs/maceda-test-cases.md)
| Installments paid | Section | Grace period | Refund if cancelled |
|---|---|---|---|
| < 24 (under 2 years) | Sec. 4 | 60 days from the due date | none |
| >= 24 | Sec. 3(a), 3(b) | 1 month per full year paid, once per 5-year window of the contract | 50% of total paid; +5% per year after year 5; max 90% |

## Files to Change
| File | Action | Why |
|---|---|---|
| `lib/maceda.ts` + test | CREATE | Deterministic RA 6552 engine |
| `lib/explain.ts` + test | CREATE | Facts, EN/FIL templates, number guardrail, AI call |
| `lib/ai.ts` | CREATE | The only file that knows about the model provider |
| `app/buyer/[subscriptionId]/page.tsx` | UPDATE | Rights section + EN/FIL toggle |
| `docs/maceda-test-cases.md` | CREATE | Plain-language test table for broker sign-off |
| `lib/db.ts`, `lib/webhook.ts` | UPDATE | Log "duplicate" vs "stored" (milestone 2 follow-up) |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Engine misreads RA 6552 | Medium | Juvy signs off the test table before the demo |
| AI states a wrong number | Medium | Number guardrail + facts rendered by code |
| Grace already used isn't tracked | Accepted | Only matters after 2+ years; demo buyers are new. Add with contract records. |
| Prompt injection via buyer name | Low | The name never goes to the model; only engine facts do |

## Acceptance
- [ ] Engine tests cover both sections, the 2-year and 5-year boundaries, the 90% cap and the 5-year grace window
- [ ] Without an API key the page shows a correct template in EN and FIL
- [ ] With a key, AI text that adds a number falls back to the template
