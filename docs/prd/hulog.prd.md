# Hulog — AI installment assistant for OFW property buyers

## Problem
Overseas Filipino Workers (OFWs) buy pre-selling condos and house-and-lot units in the Philippines on installment, paying from abroad. When a payment slips (job loss, late salary, transfer failure), many don't know that the Maceda Law (RA 6552) guarantees them a grace period and, after 2 years of payments, a cash refund, so they either stop paying and forfeit what they paid, or keep paying out of sunk-cost fear. Brokers tracking these accounts by hand learn about missed payments too late to help.

## Evidence
- About **2.16 million OFWs** worked abroad in Apr–Sep 2023, up 9.8% year over year. ([PSA, 2023 OFW final results](https://psa.gov.ph/content/2023-overseas-filipino-workers-final-results))
- Cash remittances hit a record **US$35.63B in 2025** (up 3.3%). ([Philstar, Feb 17 2026](https://www.philstar.com/business/2026/02/17/2508451/remittances-reach-record-high-356-billion/amp/))
- A 2026 case: an OFW paid **₱608,000 over 16 months** on a Mandaluyong pre-selling condo and is unsure what happens if they stop paying. The article says many buyers misunderstand the Maceda Law and that OFW buyers feel trapped by sunk cost. ([Gulf News, Aug 10 2026](https://gulfnews.com/business/property/ofw-paid-608000-for-a-manila-condo-what-the-maceda-law-can-and-cannot-save-1.500635734))
- Metro Manila had **79,200–82,900 unsold condo units** at the end of 2025 (Colliers, Leechiu), a buyer's market with discounting. Earlier buyers locked into higher prices have more reason to default. (same Gulf News source)
- A developer reported that OFWs bought most of its 95%-pre-sold inventory across 6 projects. (Century Properties via [Inquirer](https://business.inquirer.net/?p=184641), 2015, self-reported)
- **Assumption:** how often OFW buyers default, and how many forfeit without claiming Maceda rights. *Needs validation via broker records (Juvy, REB).*
- **Assumption:** brokers track installments in spreadsheets and find out about missed payments late. *Needs validation via broker interview (Juvy).*

## Users
- **Primary**: an OFW buyer paying monthly equity on a Philippine residential unit from abroad. The need is triggered when a payment fails or the buyer fears they can't keep paying.
- **Secondary**: a licensed broker or seller managing several installment buyers, who needs to spot at-risk accounts early.
- **Not for**: buyers of industrial lots, commercial buildings, or agrarian-reform tenant sales (excluded from RA 6552); bank-financed or Pag-IBIG loans; anyone looking for actual legal representation.

## Hypothesis
We believe **automated PayPal installment billing, combined with AI that explains each buyer's exact Maceda Law rights the moment a payment fails,** will **stop OFW buyers from forfeiting payments out of ignorance** for **OFWs paying pre-selling property equity from abroad**.
We'll know we're right when **a buyer sees their exact grace-period end date and refund amount, in English or Filipino, within 1 minute of a failed payment, with zero legal numbers produced by the AI**, and when **at least 3 OFWs or brokers who try the demo say they would use it**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Time from failed payment to rights explanation | < 1 minute | Demo run: timestamp of failure event vs. message shown |
| Legal-number accuracy | 100% of engine test cases match RA 6552 | Engine test cases reviewed and signed off by Juvy (REB) |
| AI-generated legal numbers | 0 | Every grace date and refund figure traceable to the deterministic engine |
| Real-user interest | ≥ 3 OFWs or brokers say "I'd use this" | Informal demo sessions before Nov 10 |
| Judge-ready demo | Works in incognito, no login wall, no API keys required | Submission checklist run on Nov 12 |

## Scope
**MVP** — The broker lists a unit, which creates a real PayPal sandbox installment plan. A buyer subscribes with PayPal. Each payment, success or failure, is recorded. When a payment fails, the buyer gets a correct, plain-language explanation of their Maceda rights (grace period, refund eligibility, options) in English or Filipino. This covers PLAN.md slices 1–3 and is the cut line.

**Stretch (only if MVP is done by Nov 5)**
- "Ask Hulog" chat answering questions from the buyer's live payment data, with explicit confirmation before any change to the subscription.
- Broker dashboard with an AI portfolio-risk summary.

**Out of scope**
- Real money or production PayPal — hackathon is sandbox-only.
- Login beyond a broker/buyer demo switch — judges need zero friction.
- Notarial notice generation and document uploads — legal-liability and time risk.
- Multiple brokers — not needed to test the hypothesis.
- Native mobile app — a responsive web page is enough.
- Legal advice — Hulog gives information only, with a visible disclaimer.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 0 | Setup | Public MIT repo and a hosted skeleton anyone can open; PayPal sandbox and test accounts ready (Oct 23–24) | in-progress (live at https://hulog.onrender.com; Devpost pending) | docs/plans/setup.plan.md |
| 1 | Plans + Subscribe | Broker lists a unit; buyer subscribes with a sandbox PayPal account and sees ACTIVE (Oct 25–28) | complete (verified in sandbox Oct 23) | docs/plans/plans-subscribe.plan.md |
| 2 | Payment ledger | Verified PayPal payment events show in the buyer's history and the broker's table (Oct 29–Nov 1) | in-progress (built; sandbox webhook 4VF079417M4545150 lacked PAYMENT.SALE.* events, so 5 real charges never reached the ledger; events added Oct 28, awaiting the next daily charge) | docs/plans/payment-ledger.plan.md |
| 3 | Rights on failure | A failed payment produces a correct, broker-reviewed Maceda explanation in EN and FIL (Nov 2–4) | complete (engine test cases signed off by Juvy, REB, Oct 24) | docs/plans/maceda-rights.plan.md |
| 4 | Ask Hulog + risk summary | Buyer asks about their situation and gets answers from live data; broker sees an at-risk summary (Nov 5–7, stretch) | pending | — |
| 5 | Demo-ready | Seeded data, a one-click "simulate missed payment", mobile layout, disclaimer (Nov 8–9) | in-progress (simulate missed payment done) | docs/plans/demo-missed-payment.plan.md |
| 6 | Submission | README, video under 3 minutes, Devpost form, all links tested in incognito (Nov 10–12) | pending | — |

## Open Questions
- [x] Can PayPal sandbox billing plans charge in PHP? **Yes** — a PHP plan was created and charged ₱15,000 in sandbox (Oct 23).
- [x] Will Juvy (REB) sign off on the Maceda engine's test cases by Nov 4? **Yes**, signed off Oct 24, including the current readings in docs/maceda-test-cases.md.
- [ ] Do the PayPal Agent Toolkit's subscription tools work with Claude as the model?
- [ ] Should the broker's buyer table target the AG Grid sponsor prize ($5k first place)?
- [ ] Can we get 3+ OFWs or brokers to try the demo before Nov 10?
- [ ] How do we answer "would a Philippine developer accept PayPal's cross-border fees?" Draft answer: Hulog is the compliance/alert layer, and PayPal is the rail for buyers who already use it abroad.
- [ ] Official Devpost judging criteria and weights. Only the prize categories are confirmed. *Check the Devpost "Judging" tab.*

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Can't trigger a real failed payment in sandbox | High | High | PayPal webhook simulator plus a demo-only replay of failure events |
| Monthly billing too slow to demo | High | Medium | Daily billing plan in sandbox |
| PHP not supported on sandbox plans | Medium | Low | Bill in USD, display the peso equivalent |
| AI states wrong legal information | Medium | High | AI only explains; all numbers come from a deterministic, broker-reviewed engine; disclaimer on every rights message |
| Global judges don't know what the Maceda Law is | High | Medium | 10-second plain explainer at the start of the video and README |
| Judges question whether the business model is realistic (PayPal fees) | Medium | Medium | One-line positioning in the README and video |
| Falling behind schedule | Medium | High | Cut line: drop milestone 4 if behind on Nov 5; milestones 1–3 are the product |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
