import fs from "node:fs";
import path from "node:path";
import { COOKIE_CONSENT_STORAGE_KEY } from "@/lib/cookie-consent";
import { FIRST_DAY_WIZARD_STORAGE_KEY } from "@/lib/onboarding/first-day-wizard-constants";
import { LAUNCHER_STORAGE_KEY } from "@/lib/launcher/user-launcher-config";

/**
 * Test harnesses re-declare the app's localStorage keys so they can dismiss
 * onboarding before a run. Nothing links the copies to the originals, and when
 * one drifts the failure is silent and expensive: a renamed first-day-wizard
 * key once left the wizard on screen in every authenticated E2E run, so every
 * one of them timed out looking for a workspace behind it.
 *
 * The keys are string literals in files that Node cannot import (a .mjs script,
 * a Playwright helper, a .tsx component), so this asserts on the text. Adding a
 * consumer means adding it here.
 */
const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CONSUMERS = ["e2e/helpers.ts", "scripts/lighthouse-auth-setup.mjs"];

/** Keys whose source of truth is an exported constant. */
const EXPORTED: Record<string, string> = {
  COOKIE_CONSENT_STORAGE_KEY: COOKIE_CONSENT_STORAGE_KEY,
  FIRST_DAY_WIZARD_STORAGE_KEY: FIRST_DAY_WIZARD_STORAGE_KEY,
  LAUNCHER_STORAGE_KEY: LAUNCHER_STORAGE_KEY,
};

/** Keys defined as a bare literal inside a component, with no export to import. */
const INLINE: Record<string, { file: string; pattern: RegExp }> = {
  PASSKEY_OFFER_KEY: {
    file: "components/auth/PasskeyOfferModal.tsx",
    pattern: /const STORAGE_KEY = "([^"]+)"/,
  },
  LAUNCHER_V2_BANNER_KEY: {
    file: "components/os/onboarding/LauncherV2MigrationBanner.tsx",
    pattern: /export const LAUNCHER_V2_BANNER_KEY = "([^"]+)"/,
  },
};

describe("localStorage keys duplicated by test harnesses", () => {
  const canonical: Record<string, string> = { ...EXPORTED };

  for (const [name, { file, pattern }] of Object.entries(INLINE)) {
    it(`still finds ${name} in ${file}`, () => {
      const match = pattern.exec(read(file));
      // If this fails the component was refactored and the regex below it is
      // now checking nothing — fix the pattern rather than deleting the test.
      expect(match?.[1]).toBeTruthy();
      canonical[name] = match![1]!;
    });
  }

  it.each(CONSUMERS)("%s uses the app's own key values", (consumer) => {
    const src = read(consumer);
    const drifted: string[] = [];
    for (const [name, value] of Object.entries(canonical)) {
      // Importing the constant is the better form and is what e2e/helpers.ts
      // does; a copied literal is accepted only while it still matches.
      const imported = new RegExp(String.raw`\b${name}\b`).test(src);
      if (!imported && !src.includes(`"${value}"`)) {
        drifted.push(`${name} (expected "${value}")`);
      }
    }
    expect(drifted).toEqual([]);
  });
});
