/**
 * Runtime mail gates from PlatformSettings (admin-controlled).
 * Transport secrets (RESEND_API_KEY / SMTP_*) stay in Vercel env — not in DB.
 */

import {
  getPlatformConfig,
  type PlatformConfig,
  type PlatformMailConfig,
} from "@/lib/platform-settings";
import {
  formatMailFrom,
  getMailFrom as getEnvMailFrom,
  getMailReplyTo as getEnvMailReplyTo,
} from "@/lib/mail-config";
import { isJewishRestDay } from "@/lib/jewish-calendar/is-jewish-rest-day";

export type { PlatformMailConfig };

export async function getPlatformMailConfig(): Promise<PlatformMailConfig> {
  const cfg = await getPlatformConfig();
  return cfg.mail;
}

export async function isPlatformMailMasterEnabled(): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  return mail.masterEnabled !== false;
}

/** When respectJewishRestDays is on (default), block all outbound on שבת/חג/מועד. */
export async function platformAllowsByJewishRestDay(now: Date = new Date()): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  if (mail.respectJewishRestDays === false) return true;
  return !isJewishRestDay(now);
}

async function platformChannelAllowed(
  channelEnabled: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  if (mail.masterEnabled === false) return false;
  if (!channelEnabled) return false;
  return platformAllowsByJewishRestDay(now);
}

export async function canSendTransactionalMail(): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  return platformChannelAllowed(mail.transactionalEnabled !== false);
}

export async function canFlushEmailDigest(): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  return platformChannelAllowed(mail.digestEnabled !== false);
}

export async function canRunLifecycleEmails(): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  return platformChannelAllowed(mail.lifecycleEnabled !== false);
}

export async function canEnqueueNotificationEmails(): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  return platformChannelAllowed(mail.notificationBridgeEnabled !== false);
}

export async function canSendCollectionReminderEmails(): Promise<boolean> {
  const mail = await getPlatformMailConfig();
  return platformChannelAllowed(mail.collectionRemindersEnabled !== false);
}

/** From address: platform override if set, else env. */
export async function resolveMailFrom(): Promise<string> {
  const mail = await getPlatformMailConfig();
  const override = mail.fromOverride?.trim();
  if (override) return formatMailFrom(override);
  return getEnvMailFrom();
}

export async function resolveMailReplyTo(): Promise<string | undefined> {
  const mail = await getPlatformMailConfig();
  const override = mail.replyToOverride?.trim();
  if (override?.includes("@")) return override;
  return getEnvMailReplyTo();
}

export function mailConfigSummary(cfg: PlatformConfig): {
  masterEnabled: boolean;
  channels: Record<string, boolean>;
  fromOverride: string;
  replyToOverride: string;
} {
  return {
    masterEnabled: cfg.mail.masterEnabled,
    channels: {
      transactional: cfg.mail.transactionalEnabled,
      digest: cfg.mail.digestEnabled,
      lifecycle: cfg.mail.lifecycleEnabled,
      notificationBridge: cfg.mail.notificationBridgeEnabled,
      collectionReminders: cfg.mail.collectionRemindersEnabled,
      respectJewishRestDays: cfg.mail.respectJewishRestDays,
    },
    fromOverride: cfg.mail.fromOverride,
    replyToOverride: cfg.mail.replyToOverride,
  };
}
