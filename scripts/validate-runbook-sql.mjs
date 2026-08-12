/**
 * Static check: RUNBOOK.md must not reference obsolete schema field names.
 * Exit 1 if drift markers are found.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runbook = readFileSync(resolve(root, "docs/RUNBOOK.md"), "utf8");

const forbidden = [
  { re: /"windowStart"/, msg: 'RateLimit.windowStart removed — use "resetAt"' },
  { re: /\bhits\b.*RateLimit|RateLimit[\s\S]{0,80}\bhits\b/, msg: "RateLimit.hits removed — use count" },
  { re: /"errorMessage"/, msg: 'DocumentScanJob.errorMessage removed — use "error"' },
  { re: /"attempts"/, msg: "DocumentScanJob.attempts does not exist" },
  { re: /DocumentScanJob[\s\S]{0,200}status = '(pending|processing)'/, msg: "DocumentScanJob status must be UPPERCASE enum" },
  { re: /OSBillingConfig[\s\S]{0,120}"organizationId"/, msg: "OSBillingConfig is a singleton — no organizationId" },
  { re: /"planId"/, msg: "OSBillingConfig.planId does not exist — use Organization.subscriptionTier" },
  { re: /same production database/i, msg: "Preview must not share production database" },
];

let failed = false;
for (const { re, msg } of forbidden) {
  if (re.test(runbook)) {
    console.error(`FAIL: ${msg}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: docs/RUNBOOK.md passes schema-drift static checks.");
