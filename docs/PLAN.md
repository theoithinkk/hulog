# Hulog — Project Plan (PayPal AI Hackathon 2026)

> **One-liner:** An AI payment assistant for Overseas Filipino Workers (OFWs) paying for a condo back home in monthly installments. It runs on **PayPal Subscriptions** and protects each buyer's rights under the **Maceda Law (RA 6552)**.
>
> **Deadline:** Nov 12, 2026, 12:00 PM PST = **Nov 13, 4:00 AM Manila**. Target: submit by **Nov 12, 9:00 PM Manila**.
>
> Sections 3 to 10 describe what was built. The schedule in section 11 is the original plan.

---

## 1. Problem

- Millions of OFWs buy pre-selling condos and house-and-lot units in the Philippines on installment, paying from abroad.
- When they miss payments (job loss, delayed salary, transfer issues), many don't know their rights. Some lose everything they've paid, even though Maceda Law guarantees a grace period and, after 2 years of payments, a cash refund.
- Brokers and developers track these payments by hand in spreadsheets. They often find out about a missed payment too late.

## 2. Users

| User | Needs |
|---|---|
| **Buyer (OFW)** | Pay automatically each month, see progress, get warned before trouble, understand their rights in plain Filipino/English |
| **Broker / Seller** | See every buyer's payment status, spot at-risk accounts early, send compliant notices |

## 3. The core flow (what the demo shows)

1. The broker creates a **unit listing**, e.g. "Unit 12B, ₱1,800,000 TCP, 36 months, ₱15,000/mo equity". Behind the scenes this creates a PayPal **Product** and **Billing Plan**.
2. The buyer opens the payment link and clicks the **PayPal Subscribe** button. They approve once, and the subscription becomes **ACTIVE**.
3. Each month PayPal charges the buyer and sends a **webhook**. Hulog records the payment and weaves it into the buyer's strip.
4. **A payment fails.** PayPal sends `BILLING.SUBSCRIPTION.PAYMENT.FAILED`. Hulog's **Maceda engine** computes the buyer's exact grace period and the AI explains it in their language, with a catch-up plan.
5. The buyer asks the **"Ask Hulog"** chat things like "What happens if I stop paying?" The AI answers using *their* real payment data from PayPal.
6. The **broker dashboard** shows all buyers: on time, in grace, or past grace. Buyers who are behind come first, most urgent at the top, each with a follow-up message for the broker to review and send.

## 4. How PayPal is used (judging criterion: "Technological Implementation")

| PayPal feature | Where |
|---|---|
| **Catalog Products API** | One product per unit listing |
| **Billing Plans API** | Installment schedule: amount, frequency, number of cycles |
| **JS SDK Subscribe button** | Buyer approval on the payment page |
| **Subscriptions API** | Show details and transactions, suspend, reactivate |
| **Webhooks** (verified with `verify-webhook-signature`) | `BILLING.SUBSCRIPTION.ACTIVATED`, `PAYMENT.SALE.COMPLETED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.CANCELLED` |
| **Subscription transactions** | Ask Hulog's read-only tools read the buyer's plan and charges straight from the Subscriptions API. The Agent Toolkit wasn't needed, since the chat has no write actions |
| **Sandbox** | All demo money is sandbox. Test buyer/seller accounts come from the Developer Dashboard |

## 5. How AI is used

- **Rights explanation:** on the buyer's page, the AI turns the Maceda engine's output into a short, warm message in English or Filipino (Taglish allowed).
- **Ask Hulog (agent):** chat with three read-only tools (plan, PayPal charges, rights), bound to the buyer's subscription on the server. There are **no write actions**; changes go through the broker.
- **Broker follow-ups:** for each buyer who's behind, the AI drafts a message. The broker reviews it and sends it; Hulog sends nothing. (The planned portfolio-risk summary was replaced by the "Needs attention" list.)
- **Check:** every number in an AI answer must appear in the facts code gave it. A rejected chat answer or follow-up gets one rewrite, then a fixed message.
- **Rule:** **the AI explains, code calculates.** All legal numbers (grace days, refund amount) come from the deterministic Maceda engine, never from the model. This prevents hallucinated legal advice.
- **Model:** Claude via the Anthropic API. Keep the provider behind one `lib/ai.ts` wrapper so it can be swapped. If no key is set, show template messages so the app still works.

## 6. Maceda Law engine (`lib/maceda.ts`) — deterministic, unit-tested

Input: total payments made (including down payment/deposits), years of installments paid, contract dates, grace periods already used.

| Situation | Rule (RA 6552) | Output |
|---|---|---|
| Paid **< 2 years** | Sec. 4: grace period of **at least 60 days** from the due date. If still unpaid, the seller may cancel **30 days after notarial notice** | Grace end date, cancellation-earliest date |
| Paid **≥ 2 years** | Sec. 3(a): grace period of **1 month per year** of installments, interest-free, usable **once every 5 years** | Grace months, end date, next eligible date |
| Paid **≥ 2 years**, contract cancelled | Sec. 3(b): **cash surrender value = 50%** of total payments, **+5% per year after year 5, max 90%**. Cancellation is valid only 30 days after notarial notice **and** after the CSV is paid | CSV amount and % |
| Any time | Sec. 5: buyer may sell or assign rights before cancellation. Sec. 6: may pay the full balance early without interest | Shown as "Your options" |

- Show the scope note: the law covers residential real estate on installment and excludes industrial lots, commercial buildings and agrarian-reform tenant sales.
- Show the disclaimer: **"Information only, not legal advice. Consult a lawyer or licensed broker."**
- ✅ Juvy (REB) to review the engine and its test cases before the demo.

## 7. Tech stack

- **Next.js 15** (App Router, TypeScript) + **Tailwind CSS**
- **Postgres** (Neon free tier), queried with `@neondatabase/serverless` and plain SQL (`db/schema.sql`, applied by `scripts/migrate.mjs`). Avoid Render's free Postgres, which expires before winners are announced on Dec 21.
- **Hosting:** **Render** web service, a sponsor with a Render prize category
- **PayPal:** REST APIs (plain `fetch`) + JS SDK
- **AI:** Anthropic SDK, Claude Haiku 5.5
- **Tests:** Vitest (Maceda engine, AI number check, Ask Hulog loop, follow-ups, webhooks, PayPal client, rate limits). The Playwright end-to-end test wasn't written.

## 8. Data model (one table)

```
payment_events  event_id (PayPal's, primary key), event_type, subscription_id, amount, currency,
                occurred_at, received_at, raw (jsonb)
```

- **Units** are PayPal products and plans. The plan description records the total price and the installments paid before Hulog.
- **Buyers** are PayPal subscriptions. Status, name and payment counts are read live from PayPal.
- **Simulated failures** are rows whose `event_id` starts with `DEMO-`.
- Not stored yet: grace periods already used (`graceUsedAt`), and down payments. Add them with contract records.

## 9. Pages and API routes

**Pages**
- `/` — landing page: problem, how it works, "Try the demo" button
- `/broker` — dashboard: "Needs attention" with follow-up drafts, other buyers, units with payment links, recent payments, "New unit" form
- `/pay/[planId]` — buyer payment page with the PayPal Subscribe button. On approval it opens the buyer's page
- `/buyer/[subscriptionId]` — buyer home: weave strip, rights panel, payment history, Ask Hulog chat, demo controls

**API route**
- `POST /api/webhooks/paypal` — verify the signature and record the event once. Rights and AI text are worked out when a page is viewed, not here

**Server actions** (instead of API routes)
- Broker: `createUnit` (PayPal product and plan), `draftBuyerFollowUp`, `resumePlan` (demo only)
- Buyer: `askHulog`; demo only: `simulateMissedPayment`, `simulateLongMissedPayment`, `resetDemo`

## 10. Environment variables (`.env.example`)

```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
PAYPAL_WEBHOOK_ID=
ANTHROPIC_API_KEY=
DATABASE_URL=
DEMO_MODE=true
```

## 11. Build slices and schedule (today = Oct 23)

Each slice runs as **/plan → /tdd → build → /code-review + security check → commit → deploy**.

| Dates | Slice | Done when… |
|---|---|---|
| **Oct 23–24** | **0. Setup** | Devpost registered; PayPal sandbox app + test accounts; public GitHub repo with MIT license; Next.js skeleton deployed on Render |
| **Oct 25–28** | **1. Plans + Subscribe** | Broker creates a unit and a real PayPal Plan is created; buyer subscribes with a sandbox account; status shows ACTIVE |
| **Oct 29–Nov 1** | **2. Webhooks + ledger** | Webhooks are verified and stored; payments show in buyer history and broker table. Test with the Dashboard webhook simulator and a **daily** billing plan |
| **Nov 2–4** | **3. Maceda engine + AI explainer** | Engine passes all test cases (Juvy-reviewed); a failed-payment event produces a correct AI message in EN and FIL |
| **Nov 5–7** | **4. Ask Hulog + broker summary** | The chat answers using live PayPal data via the Agent Toolkit; write actions require confirmation; AI risk summary on the dashboard |
| **Nov 8–9** | **5. Polish + demo mode** | Seeded demo data, the "Simulate missed payment" button, mobile layout, error states, disclaimer |
| **Nov 10–11** | **6. README + video** | README complete; video recorded, under 3 minutes, on YouTube, public |
| **Nov 12** | **7. Submit** | Devpost form complete, all links tested in an incognito window |

**Cut line:** if behind on Nov 5, drop the broker AI summary and the buyer chat's write actions. Keep slices 1–3. They are the core of the project.

## 12. Out of scope (do NOT build)

- Real money or production PayPal
- Login systems beyond a simple demo switch between "broker" and "buyer"
- Notarial notice generation, document uploads, multiple brokers
- Native mobile app (a responsive web page is enough)

## 13. Demo video script (≤ 2:50)

1. **0:00–0:20 Problem:** "Maria works in Dubai and pays ₱15,000 a month for her condo in Parañaque. One month her salary is late…"
2. **0:20–0:50 Broker:** create a unit, which creates a PayPal Plan (show the sandbox dashboard briefly)
3. **0:50–1:20 Buyer:** subscribe with PayPal, then the progress screen
4. **1:20–2:00 Missed payment:** simulate the failure, the webhook arrives, the AI explains the 60-day grace period in Filipino
5. **2:00–2:30 Ask Hulog:** "Paano kung hindi na ako makabayad?" ("What if I can't pay anymore?") The AI answers with her real numbers
6. **2:30–2:50 Broker dashboard + wrap-up:** PayPal features used, AI used, impact

No copyrighted music, and no third-party logos except PayPal (which is allowed).

## 14. README outline

1. Hulog — the one-liner + **Try it** (hosted URL + demo steps for judges)
2. The problem and who it's for
3. Architecture diagram
4. How PayPal is used (table from §4)
5. How AI is used (§5) + **AI tools used to build it** (Claude Code, ECC planner/TDD/reviewer)
6. Maceda Law engine + disclaimer
7. Run locally (`npm install`, `cp .env.example .env.local`, `npm run dev`) + sandbox setup steps
8. Tests
9. What's live vs simulated
10. License (MIT)

## 15. Submission checklist

- [ ] Public repo, **MIT license visible in the About section**
- [ ] Hosted demo URL works in incognito mode, with no login wall
- [ ] Demo mode works even without API keys
- [ ] Video under 3:00, public on YouTube
- [ ] Devpost text: features, PayPal features used, AI tools and how they were used
- [ ] No secrets committed (check git history and `.env` in `.gitignore`)
- [ ] Optional: apply for the **Render** sponsor prize, and mention Ask Hulog's live PayPal tools for **Best Use of PayPal + AI / Agentic Commerce**

## 16. CLAUDE.md (put in the repo root)

```
# Hulog
Next.js 15 + TypeScript + Tailwind + Neon Postgres (plain SQL). PayPal sandbox only.
- Always /plan before a new slice; follow PLAN.md slices in order.
- Write tests first for lib/maceda.ts and the webhook handler.
- Legal numbers come ONLY from lib/maceda.ts — never let the AI calculate them.
- The AI only reads. It has no tool that changes a subscription.
- Verify every PayPal webhook signature before trusting it.
- Never commit .env or keys. Run /code-review and a security check before each commit.
- Keep it simple: no features outside PLAN.md without asking.
```

## 17. Risks

| Risk | Mitigation |
|---|---|
| Hard to trigger a real failed payment in sandbox | Demo-only "Simulate a missed payment" button that adds a marked row to the ledger |
| Monthly billing is too slow to demo | Use a **daily** billing plan in sandbox |
| PHP currency issue on sandbox plans | Fall back to USD and show the peso equivalent |
| AI gives wrong legal info | Deterministic engine, AI only explains, disclaimer, Juvy reviews |
| Running out of time | Cut line in §11 |
