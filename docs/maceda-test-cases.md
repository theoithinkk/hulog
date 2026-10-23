# Maceda Law engine: test cases for broker review

Hulog computes every legal number with fixed rules (`lib/maceda.ts`). The AI only rewords these results. Each row below is an automated test in `lib/maceda.test.ts`. Please mark each row **OK** or write the correct answer.

Assumptions:
- Installments are monthly, so "years paid" = installments paid ÷ 12, rounded down.
- Dates follow the Philippine calendar.

| # | Situation | Hulog's answer | OK? |
|---|---|---|---|
| 1 | 11 installments paid (under 2 years), installment due **Nov 15, 2026** missed | Sec. 4. Grace period **60 days, until Jan 14, 2027**. No cash surrender value. Seller may cancel only 30 days after the buyer receives a notarial notice. | |
| 2 | 23 installments paid | Still Sec. 4 (under 2 years) | |
| 3 | 24 installments paid (exactly 2 years), ₱360,000 paid, due Nov 15, 2026 missed | Sec. 3. Grace **2 months, until Jan 15, 2027**, interest-free. Refund if cancelled: **50% = ₱180,000** | |
| 4 | 60 installments (5 years) | Refund **50%** | |
| 5 | 71 installments (5 years, 11 months) | Refund **50%** (only full years count) | |
| 6 | 72 installments (6 years) | Refund **55%** (first year after year 5) | |
| 7 | 84 installments (7 years) | Refund **60%** | |
| 8 | 144 installments (12 years) | Refund **85%** | |
| 9 | 156 installments (13 years) | Refund **90%** (the maximum) | |
| 10 | 200 installments | Refund stays at **90%** | |
| 11 | 24 installments, due **Dec 31, 2026** missed | Grace ends **Feb 28, 2027** (no Feb 31, so the last day of the month) | |
| 12 | Contract started Jan 15, 2026; grace already used Jun 2028; misses again Mar 2029 | **No grace this time**: one grace period per 5 years of the contract. Available again from **Jan 15, 2031** | |
| 13 | Contract started Jan 15, 2020; grace used Jun 2023; misses Mar 1, 2026 with 72 installments paid | Grace available again (a new 5-year period started Jan 15, 2025): **6 months, until Sep 1, 2026** | |

Every rights message also says, for all buyers:
- Sec. 5: the buyer can sell or assign their rights before the contract is cancelled.
- Sec. 6: the buyer can pay the full balance early without interest.

## Questions for the reviewer
1. **Five-year windows (row 12).** Sec. 3(a) says grace can be used "once in every five years of the life of the contract." Hulog counts fixed windows from the contract start (years 0–5, 5–10, ...). Is that the right reading, or should it be 5 years from the last grace used?
2. **Down payment (row 3).** Sec. 3(b) counts *total payments*, including down payments and deposits. Hulog only sees payments made through PayPal. Should brokers enter the down payment so the refund includes it?
3. **Years paid (row 5).** Do partial years count toward the extra 5% after year 5, or only full years (Hulog's current reading)?
4. **Rounding.** Refunds are rounded to the nearest centavo. Is that acceptable?
