# Pricing draft (not billed yet)

Proposed metering for a future billing iteration (PayPlus / Stripe already exist for subscriptions):

| Dimension | Suggested free / trial | Paid |
|-----------|------------------------|------|
| Seats (users) | 2 | per-seat add-on |
| AI scan enqueues / day / org | 20 | 120+ by tier (enforced in analyze-queue) |
| Active projects | 3 | unlimited on Pro |
| Issued documents / month | 20 | unlimited on Pro |

Implementation note: daily AI cap is already enforced in [`app/api/analyze-queue/add/route.ts`](../app/api/analyze-queue/add/route.ts). Seat metering and document quotas remain follow-up.
