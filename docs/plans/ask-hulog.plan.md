# Plan: Ask Hulog (Milestone 4, first slice)

**Source PRD**: docs/prd/hulog.prd.md
**Selected Milestone**: 4. Ask Hulog + risk summary (the chat; the broker summary comes later)
**Complexity**: Medium

## Summary
The buyer page gets an **Ask Hulog** chat. The buyer types a question in English or Filipino ("Paano kung hindi na ako makabayad?") and Claude answers from their own live data. It reads that data through three tools: the PayPal subscription, the PayPal transaction list, and the Maceda engine's facts.

## Decisions
- **Read-only.** There are no tools that pause, cancel or change a subscription. The PRD's cut line drops write actions. A question about changing the plan gets "ask your broker".
- **Tools are bound to the page's subscription on the server.** The model never chooses an ID, so it can't read another buyer's data.
- **Code calculates, the AI explains, as in milestone 3.** Every number in an answer must appear in a tool result from that same request. The question doesn't count, so a buyer can't make the AI repeat an invented number. If an answer fails the check, the model gets one rewrite, told what was wrong, and the check runs again. If that fails too, the buyer sees a fixed fallback that points to the rights panel.
- **Live PayPal data.** The transaction list comes from the Subscriptions API (`/transactions`), not only from the webhook ledger, so the chat uses a second PayPal API live.
- **Claude Haiku 5.5 at low effort**, the same model as the rights paragraph. Tried against Opus 5.5 on the same questions: Haiku often spells numbers out, but the rewrite fixes that, at 1/40 of the token price. It has no server-side refusal fallback, so a refusal shows the fixed fallback. At most 4 model rounds per question.
- **History stays in the browser.** Only the last 6 text turns are sent back, each validated (role, length). Nothing is stored.

## Files to Change
| File | Action | Why |
|---|---|---|
| `lib/paypal.ts` + test | UPDATE | `listTransactions()` |
| `lib/explain.ts` | UPDATE | Share the number guard with a longer length limit |
| `lib/ask.ts` + test | CREATE | Turn validation, tool facts, the tool loop and the guard |
| `app/buyer/[subscriptionId]/actions.ts` | UPDATE | `askHulog` server action |
| `app/buyer/[subscriptionId]/ask-hulog.tsx` | CREATE | Chat panel with suggested questions |
| `app/buyer/[subscriptionId]/page.tsx` | UPDATE | Show the panel |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| AI states a wrong number or date | Medium | Number guard against tool results; one rewrite, then a fixed fallback; disclaimer |
| AI uses a known number in a wrong claim ("1 payment on each day" when a day had none) | Medium | Accepted: the guard checks numbers, not claims; rights panel and history sit on the same page |
| Cost from repeated questions | Low | Existing per-IP rate limit covers the page's POSTs; 4-round cap; short history |
| Prompt injection through the question | Medium | Read-only tools bound to one subscription; nothing to leak beyond the buyer's own data |
| Slow answers | Medium | Low effort, pending state in the UI |

## Acceptance
- [ ] "What happens if I stop paying?" gets the grace period end date from the engine, in EN and FIL
- [ ] "How much have I paid?" uses PayPal's transaction list
- [ ] An answer with a number not in the tool results gets one rewrite, then the fallback
- [ ] Without an API key the panel says the chat is off, and the rest of the page works
