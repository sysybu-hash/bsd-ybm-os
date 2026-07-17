/**
 * Shared org mail prefs (safe for client + server).
 * DB access lives in org-mail-settings.ts.
 */

import { z } from "zod";

export const orgMailPrefsSchema = z.object({
  /** Org kill-switch for optional emails (not verification/invites) */
  masterEnabled: z.boolean().default(true),
  digestEnabled: z.boolean().default(true),
  lifecycleEnabled: z.boolean().default(true),
  notificationBridgeEnabled: z.boolean().default(true),
  collectionRemindersEnabled: z.boolean().default(true),
  /** Do not send org mail on Shabbat / Yom Tov / Chol HaMoed (Asia/Jerusalem) */
  respectJewishRestDays: z.boolean().default(true),
});

export type OrgMailPrefs = z.infer<typeof orgMailPrefsSchema>;

export const DEFAULT_ORG_MAIL_PREFS: OrgMailPrefs = {
  masterEnabled: true,
  digestEnabled: true,
  lifecycleEnabled: true,
  notificationBridgeEnabled: true,
  collectionRemindersEnabled: true,
  respectJewishRestDays: true,
};

export function parseOrgMailPrefs(raw: unknown): OrgMailPrefs {
  const parsed = orgMailPrefsSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ...DEFAULT_ORG_MAIL_PREFS };
  return { ...DEFAULT_ORG_MAIL_PREFS, ...parsed.data };
}
