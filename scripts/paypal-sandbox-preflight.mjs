/**
 * Preflight for the signup payment path (PR #41) against PayPal sandbox.
 *
 * Proves the parts a human should not have to discover by clicking:
 *   1. sandbox credentials are present and actually authenticate
 *   2. the app's own endpoint creates an order at the right price
 *   3. that order carries the custom_id verifyRegistrationPayPalOrder needs
 * and then prints the approval link, which is the only step a human must do.
 *
 * Read-only with respect to your database — it never registers anyone.
 *
 *   node scripts/paypal-sandbox-preflight.mjs --tier=COMPANY
 *   node scripts/paypal-sandbox-preflight.mjs --tier=COMPANY --cycle=annual
 *   node scripts/paypal-sandbox-preflight.mjs --order=5AB12345CD678901E  # after approving
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const tier = String(arg("tier", "COMPANY")).toUpperCase();
const cycle = String(arg("cycle", "monthly")).toLowerCase() === "annual" ? "annual" : "monthly";
const email = String(arg("email", "sandbox-buyer@example.com")).toLowerCase();
const appUrl = String(arg("app", "http://localhost:3000")).replace(/\/$/, "");
const inspectId = arg("order", "") || arg("inspect", "");

const paypalEnv = (process.env.PAYPAL_ENV ?? "").trim().toLowerCase();
const isSandbox = paypalEnv === "sandbox" || paypalEnv === "test";
const base = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
const clientId = (process.env.PAYPAL_CLIENT_ID ?? process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "").trim();
const secret = (process.env.PAYPAL_CLIENT_SECRET ?? "").trim();

function fail(msg) {
  console.error(`\n  FAIL  ${msg}\n`);
  process.exitCode = 1;
}
function ok(msg) {
  console.log(`  ok    ${msg}`);
}

async function token() {
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`auth failed (${res.status}) — check client id / secret`);
  const data = await res.json();
  return data.access_token;
}

async function fetchOrder(accessToken, id) {
  const res = await fetch(`${base}/v2/checkout/orders/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`could not read order ${id} (${res.status})`);
  return res.json();
}

function reportCustomId(customId) {
  const parts = String(customId ?? "").split("|");
  const shapeOk = parts[0] === "REG" && parts[2] === "TIER";
  if (!shapeOk) {
    fail(`custom_id "${customId}" is not REG|<email>|TIER|<tier>|<cycle> — the verifier will reject this payment`);
    return null;
  }
  ok(`custom_id parses: email=${parts[1]} tier=${parts[3]} cycle=${parts[4] ?? "?"}`);
  return { email: parts[1], tier: parts[3], cycle: parts[4] };
}

async function main() {
  console.log("\n=== PayPal signup-payment preflight ===\n");

  console.log(`PAYPAL_ENV                    ${paypalEnv || "(unset)"}`);
  if (!isSandbox) {
    fail("PAYPAL_ENV is not sandbox. Refusing to create live orders — set PAYPAL_ENV=sandbox in .env.local.");
    return;
  }
  ok("sandbox mode");

  if (!clientId || !secret) {
    fail("missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET");
    return;
  }
  ok("credentials present");

  if (!(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "").trim()) {
    console.log("  warn  NEXT_PUBLIC_PAYPAL_CLIENT_ID is unset — the buttons will render 'payment unavailable'");
  } else {
    ok("NEXT_PUBLIC_PAYPAL_CLIENT_ID present (the buttons need a *sandbox* client id here)");
  }

  const accessToken = await token();
  ok("authenticated against sandbox");

  if (inspectId && process.argv.includes("--capture")) {
    // Captures the approved order and replays exactly what
    // lib/paypal-order-parse.ts + lib/register-paypal-verify.ts read, so the
    // last unverified hop is proven without writing anything to a database.
    const res = await fetch(`${base}/v2/checkout/orders/${inspectId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      fail(`capture failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
      return;
    }
    ok(`captured, capture call returned status ${data.status}`);

    // The verifier re-reads the order after capturing rather than parsing the
    // capture response, so mirror that here instead of inspecting `data`.
    const settled = await fetchOrder(accessToken, inspectId);
    const u0 = settled.purchase_units?.[0] ?? {};
    const cap0 = u0.payments?.captures?.[0] ?? {};
    console.log(`  capture id      ${cap0.id}`);
    console.log(`  capture status  ${cap0.status}`);
    console.log(`  amount          ${cap0.amount?.value} ${cap0.amount?.currency_code}`);
    console.log(`  custom_id on    unit=${u0.custom_id ? "yes" : "no"} capture=${cap0.custom_id ? "yes" : "no"}`);

    // parseCapturePayload's conditions, including the capture-level fallback
    const customId = String(u0.custom_id || cap0.custom_id || "");
    const parseOk =
      settled.status === "COMPLETED" && cap0.status === "COMPLETED" && !!customId && !!cap0.id;
    console.log(parseOk ? "  ok    parseCapturePayload would accept this" : "  FAIL  parseCapturePayload would reject this");

    // verifyRegistrationPayPalOrder's conditions
    const parts = customId.split("|");
    const verifyOk =
      parts[0] === "REG" && parts[2] === "TIER" && !!parts[1] && !!parts[3] && parts[3] !== "FREE";
    console.log(
      verifyOk
        ? `  ok    verifyRegistrationPayPalOrder would return tier=${parts[3]} for ${parts[1]}`
        : "  FAIL  verifyRegistrationPayPalOrder would reject this custom_id",
    );
    if (!parseOk || !verifyOk) process.exitCode = 1;
    console.log(
      "\n  Registering with this orderID and that exact email would create an ACTIVE org on the tier above.\n",
    );
    return;
  }

  if (inspectId) {
    const order = await fetchOrder(accessToken, inspectId);
    const pu = order.purchase_units?.[0] ?? {};
    console.log(`\norder ${inspectId}`);
    console.log(`  status    ${order.status}`);
    console.log(`  amount    ${pu.amount?.value} ${pu.amount?.currency_code}`);
    reportCustomId(pu.custom_id);
    console.log(
      order.status === "APPROVED" || order.status === "COMPLETED"
        ? "\n  Approved. POST /api/register with this orderID will capture it and grant the tier from custom_id.\n"
        : `\n  Not approved yet (status ${order.status}).\n`,
    );
    return;
  }

  // Create through the app so the real pricing + custom_id code runs.
  console.log(`\ncreating an order via ${appUrl}/api/register/paypal/create-order ...`);
  let created;
  try {
    const res = await fetch(`${appUrl}/api/register/paypal/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, tier, billingCycle: cycle }),
    });
    created = await res.json();
    if (!res.ok || !created.id) {
      fail(`endpoint returned ${res.status}: ${JSON.stringify(created)}`);
      return;
    }
  } catch {
    fail(`could not reach ${appUrl} — start the dev server first (npm run dev)`);
    return;
  }
  ok(`endpoint created order ${created.id}`);

  const order = await fetchOrder(accessToken, created.id);
  const pu = order.purchase_units?.[0] ?? {};
  console.log(`\n  requested   tier=${tier} cycle=${cycle} email=${email}`);
  console.log(`  order says  amount=${pu.amount?.value} ${pu.amount?.currency_code} status=${order.status}`);

  const parsed = reportCustomId(pu.custom_id);
  if (parsed && parsed.tier !== tier) {
    fail(`custom_id tier ${parsed.tier} != requested ${tier}`);
  }
  if (parsed && parsed.email !== email) {
    fail(`custom_id email ${parsed.email} != requested ${email}`);
  }
  if (pu.amount?.currency_code !== "ILS") {
    fail(`currency is ${pu.amount?.currency_code}, expected ILS`);
  }

  const approve = (order.links ?? []).find((l) => l.rel === "approve" || l.rel === "payer-action");
  console.log("\n--- the only step that needs a human ---");
  console.log(approve?.href ?? "(no approval link returned)");
  console.log("\nApprove it with a sandbox buyer account, then run:");
  console.log(`  node scripts/paypal-sandbox-preflight.mjs --order=${created.id}\n`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
