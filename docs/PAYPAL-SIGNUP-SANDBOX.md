# Verifying the signup payment path against PayPal sandbox

Checklist for validating PR #41 (plan step + PayPal payment in the register
wizard) before trusting it in production.

---

## ⚠️ Read this first

Two things in the current local setup will bite you:

1. **`.env.local` has `PAYPAL_ENV="live"`.** Running the wizard locally as-is
   creates *real* PayPal orders.
2. **`.env.local`'s `DATABASE_URL` points at the production Neon database.**
   Completing a signup locally therefore writes a real organization into
   production data. (`npm run audit:unpaid-tiers` run against it returns live
   customer organizations — that is the same database.)

So do **not** simply run `npm run dev` and click through. Point both at
throwaway targets first:

```bash
# in a scratch env file — do NOT leave these in .env.local
PAYPAL_ENV="sandbox"
PAYPAL_CLIENT_ID="<sandbox app client id>"
PAYPAL_CLIENT_SECRET="<sandbox app secret>"
NEXT_PUBLIC_PAYPAL_CLIENT_ID="<same sandbox client id>"
DATABASE_URL="<a scratch database, not production>"
```

`NEXT_PUBLIC_PAYPAL_CLIENT_ID` must be the **sandbox** client id. The buttons
load `https://www.paypal.com/sdk/js` in both modes; it is the client id that
decides which environment the payer lands in.

---

## What you do *not* need to prove by hand

The server trusting only the verified order — choosing `CORPORATE` on the plan
step while paying for `COMPANY` still yielding `COMPANY` — is already covered by
an automated test that shipped in #38:

```
app/api/register/route.test.ts
  › a verified PayPal order does grant the paid tier and activates the account
```

It sends `plan: "corporate"` alongside a verified `COMPANY` order and asserts the
organization is created on `COMPANY`. Run it with:

```bash
npx jest app/api/register
```

What the sandbox run still has to prove is the part no test can fake: that a real
PayPal approve → capture round trip works end to end.

---

## 1. Preflight (no clicking)

With the dev server running against the scratch env:

```bash
node scripts/paypal-sandbox-preflight.mjs --tier=COMPANY
```

It refuses to run unless `PAYPAL_ENV` is sandbox, then checks credentials
authenticate, creates an order **through the app's own endpoint** so the real
pricing and `custom_id` code runs, and verifies the order came back with:

- the requested tier and email inside `custom_id`
- `custom_id` in the shape `REG|<email>|TIER|<tier>|<cycle>` that
  `verifyRegistrationPayPalOrder` parses
- currency `ILS` and the server-side price

Then it prints the approval link. Add `--cycle=annual` to check annual pricing.

## 2. Approve (the only manual step)

Open the printed link, approve with a sandbox buyer account, then:

```bash
node scripts/paypal-sandbox-preflight.mjs --inspect=<ORDER_ID>
```

Expect `status: APPROVED`, the right amount, and a `custom_id` that parses.

## 3. Full wizard run

Register through the UI with a paid tier and complete the PayPal approval.
Confirm afterwards:

- the organization is `ACTIVE` on the tier that was **paid for**
- scan balances match `defaultScanBalancesForTier` for that tier
- the "access approved" email went out rather than the pending-approval one
- picking the free plan still lands in `PENDING_APPROVAL` on `FREE`

## 4. Failure paths worth a look

- Cancel at the PayPal step — the wizard should stay on the summary with no
  account created.
- Submit with a paid tier and no approval — blocked client-side, and the server
  would withhold the tier anyway.
- Unset `NEXT_PUBLIC_PAYPAL_CLIENT_ID` — the buttons should degrade to the
  "payment unavailable" message, not a dead step.
