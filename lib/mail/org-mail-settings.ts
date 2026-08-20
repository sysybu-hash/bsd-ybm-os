/**
 * Per-organization (tenant / מנוי) email preferences.
 * Platform gates in platform-mail-settings still apply first.
 */

import { prisma } from "@/lib/prisma";
import {
  orgMailPrefsSchema,
  parseOrgMailPrefs,
  type OrgMailPrefs,
} from "@/lib/mail/org-mail-prefs-shared";
import { isJewishRestDay } from "@/lib/jewish-calendar/is-jewish-rest-day";

export {
  DEFAULT_ORG_MAIL_PREFS,
  orgMailPrefsSchema,
  parseOrgMailPrefs,
  type OrgMailPrefs,
} from "@/lib/mail/org-mail-prefs-shared";

export async function getOrgMailPrefs(organizationId: string): Promise<OrgMailPrefs> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { mailPrefsJson: true },
  });
  return parseOrgMailPrefs(org?.mailPrefsJson);
}

export async function updateOrgMailPrefs(
  organizationId: string,
  patch: Partial<OrgMailPrefs>,
): Promise<OrgMailPrefs> {
  const current = await getOrgMailPrefs(organizationId);
  const next = parseOrgMailPrefs({ ...current, ...patch });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { mailPrefsJson: next },
  });
  return next;
}

/** Resolve org prefs for a user email (digest / lifecycle recipients). */
export async function getOrgMailPrefsForEmail(email: string): Promise<OrgMailPrefs | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return null;
  return getOrgMailPrefs(user.organizationId);
}

function orgAllowsByJewishRestDay(prefs: OrgMailPrefs, now: Date = new Date()): boolean {
  if (prefs.respectJewishRestDays === false) return true;
  return !isJewishRestDay(now);
}

function orgChannelAllowed(prefs: OrgMailPrefs, channelOn: boolean, now?: Date): boolean {
  if (prefs.masterEnabled === false) return false;
  if (!channelOn) return false;
  return orgAllowsByJewishRestDay(prefs, now);
}

export async function orgAllowsDigest(organizationId: string): Promise<boolean> {
  const p = await getOrgMailPrefs(organizationId);
  return orgChannelAllowed(p, p.digestEnabled !== false);
}

export async function orgAllowsLifecycle(organizationId: string): Promise<boolean> {
  const p = await getOrgMailPrefs(organizationId);
  return orgChannelAllowed(p, p.lifecycleEnabled !== false);
}

export async function orgAllowsNotificationEmails(organizationId: string): Promise<boolean> {
  const p = await getOrgMailPrefs(organizationId);
  return orgChannelAllowed(p, p.notificationBridgeEnabled !== false);
}

export async function orgAllowsCollectionEmails(organizationId: string): Promise<boolean> {
  const p = await getOrgMailPrefs(organizationId);
  return orgChannelAllowed(p, p.collectionRemindersEnabled !== false);
}

export async function emailAllowsDigest(email: string): Promise<boolean> {
  const prefs = await getOrgMailPrefsForEmail(email);
  if (!prefs) return true; // no org → allow (platform admin digests etc.)
  return orgChannelAllowed(prefs, prefs.digestEnabled !== false);
}

export async function emailAllowsLifecycle(email: string): Promise<boolean> {
  const prefs = await getOrgMailPrefsForEmail(email);
  if (!prefs) return true;
  return orgChannelAllowed(prefs, prefs.lifecycleEnabled !== false);
}
