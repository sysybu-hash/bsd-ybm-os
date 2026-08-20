import { z } from "zod";
import { AUTOMATION_CATALOG } from "@/lib/os-automations/catalog";
import type { AutomationIntent } from "@/lib/os-automations/types";
import { normalizeConstructionTrade } from "@/lib/construction-trades";
import { normalizeIndustryType, type IndustryType } from "@/lib/professions/config";
import { prisma } from "@/lib/prisma";

const PLATFORM_SETTINGS_ID = "default";

const featureFlagsSchema = z.object({
  meckanoGlobal: z.boolean().default(true),
  geminiLiveEnabled: z.boolean().default(true),
  driveSyncDefault: z.boolean().default(true),
  /** מאגר ידע (Drive Ingest/Parsed/Issued) — כבוי בפרוד עד QA */
  knowledgeVaultEnabled: z.boolean().default(false),
  /** Gemini Live כברירת מחדל בחלון aiChatFull */
  aiChatLiveDefault: z.boolean().default(false),
  /** proactiveAudio / affectiveDialog ב-Live */
  geminiLiveAdvancedFeatures: z.boolean().default(false),
  /** קופיילוט שטח — הצעות מחיר מהאתר */
  fieldCopilotEnabled: z.boolean().default(true),
});

/** Admin-controlled mail channels (secrets stay in Vercel env). */
export const platformMailSchema = z.object({
  /** Master kill-switch — off = no outbound mail */
  masterEnabled: z.boolean().default(true),
  /** Welcome / verify / provision / transactional */
  transactionalEnabled: z.boolean().default(true),
  /** Daily digest flush (cron email-digest) */
  digestEnabled: z.boolean().default(true),
  /** Trial ending + reactivation campaigns */
  lifecycleEnabled: z.boolean().default(true),
  /** App notifications → digest queue */
  notificationBridgeEnabled: z.boolean().default(true),
  /** Collection reminder emails */
  collectionRemindersEnabled: z.boolean().default(true),
  /** Do not send mail on Shabbat / Yom Tov / Chol HaMoed (Asia/Jerusalem) */
  respectJewishRestDays: z.boolean().default(true),
  /** Override From (empty = MAIL_FROM / EMAIL_FROM env) */
  fromOverride: z.string().max(200).default(""),
  /** Override Reply-To (empty = MAIL_REPLY_TO / SMTP_USER) */
  replyToOverride: z.string().max(200).default(""),
  /** Days before trial end to send warning */
  lifecycleTrialDaysBefore: z.number().int().min(1).max(30).default(3),
  /** Days without login before reactivation nudge */
  lifecycleInactiveDays: z.number().int().min(3).max(90).default(7),
});

export type PlatformMailConfig = z.infer<typeof platformMailSchema>;

export const DEFAULT_PLATFORM_MAIL: PlatformMailConfig = {
  masterEnabled: true,
  transactionalEnabled: true,
  digestEnabled: true,
  lifecycleEnabled: true,
  notificationBridgeEnabled: true,
  collectionRemindersEnabled: true,
  respectJewishRestDays: true,
  fromOverride: "",
  replyToOverride: "",
  lifecycleTrialDaysBefore: 3,
  lifecycleInactiveDays: 7,
};

export const platformConfigSchema = z.object({
  version: z.number().int().default(1),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().default(""),
  registrationOpen: z.boolean().default(true),
  defaultTrialDays: z.number().int().min(1).max(365).default(30),
  defaultTrialScans: z.number().int().min(0).max(10_000).default(30),
  automationEnabled: z.record(z.string(), z.boolean()).default({}),
  defaultConstructionTrade: z.string().default("GENERAL_CONTRACTOR"),
  defaultIndustryForRegistration: z.string().default("CONSTRUCTION"),
  featureFlags: featureFlagsSchema.default({
    meckanoGlobal: true,
    geminiLiveEnabled: true,
    driveSyncDefault: true,
    knowledgeVaultEnabled: false,
    aiChatLiveDefault: false,
    geminiLiveAdvancedFeatures: false,
    fieldCopilotEnabled: true,
  }),
  mail: platformMailSchema.default(DEFAULT_PLATFORM_MAIL),
});

export type PlatformConfig = z.infer<typeof platformConfigSchema>;

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  version: 1,
  maintenanceMode: false,
  maintenanceMessage: "",
  registrationOpen: true,
  defaultTrialDays: 30,
  defaultTrialScans: 30,
  automationEnabled: Object.fromEntries(
    AUTOMATION_CATALOG.map((e) => [e.id, true]),
  ) as Record<string, boolean>,
  defaultConstructionTrade: "GENERAL_CONTRACTOR",
  defaultIndustryForRegistration: "CONSTRUCTION",
  featureFlags: {
    meckanoGlobal: true,
    geminiLiveEnabled: true,
    driveSyncDefault: true,
    knowledgeVaultEnabled: false,
    aiChatLiveDefault: false,
    geminiLiveAdvancedFeatures: false,
    fieldCopilotEnabled: true,
  },
  mail: { ...DEFAULT_PLATFORM_MAIL },
};

let cachedConfig: PlatformConfig | null = null;
let cacheAt = 0;
const CACHE_MS = 15_000;

function mergeWithDefaults(raw: unknown): PlatformConfig {
  const parsed = platformConfigSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : DEFAULT_PLATFORM_CONFIG;
  const automationEnabled: Record<string, boolean> = { ...DEFAULT_PLATFORM_CONFIG.automationEnabled };
  for (const entry of AUTOMATION_CATALOG) {
    const v = base.automationEnabled[entry.id];
    automationEnabled[entry.id] = typeof v === "boolean" ? v : true;
  }
  return {
    ...DEFAULT_PLATFORM_CONFIG,
    ...base,
    automationEnabled,
    defaultConstructionTrade: normalizeConstructionTrade(base.defaultConstructionTrade),
    defaultIndustryForRegistration: normalizeIndustryType(
      base.defaultIndustryForRegistration,
    ) as IndustryType,
    featureFlags: {
      ...DEFAULT_PLATFORM_CONFIG.featureFlags,
      ...base.featureFlags,
    },
    mail: {
      ...DEFAULT_PLATFORM_MAIL,
      ...base.mail,
    },
  };
}

export async function getDefaultConstructionTradeForRegistration(): Promise<string> {
  const cfg = await getPlatformConfig();
  return normalizeConstructionTrade(cfg.defaultConstructionTrade);
}

export async function getDefaultIndustryForRegistration(): Promise<IndustryType> {
  const cfg = await getPlatformConfig();
  return normalizeIndustryType(cfg.defaultIndustryForRegistration) as IndustryType;
}

export async function getPlatformConfig(forceRefresh = false): Promise<PlatformConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - cacheAt < CACHE_MS) {
    return cachedConfig;
  }

  let row = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });

  if (!row) {
    await prisma.platformSettings.createMany({
      data: [
        {
          id: PLATFORM_SETTINGS_ID,
          configJson: DEFAULT_PLATFORM_CONFIG,
        },
      ],
      skipDuplicates: true,
    });
    row = await prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    if (!row) {
      cachedConfig = DEFAULT_PLATFORM_CONFIG;
      cacheAt = now;
      return DEFAULT_PLATFORM_CONFIG;
    }
  }

  cachedConfig = mergeWithDefaults(row.configJson);
  cacheAt = now;
  return cachedConfig;
}

export function invalidatePlatformConfigCache(): void {
  cachedConfig = null;
  cacheAt = 0;
}

export async function updatePlatformConfig(
  patch: Partial<PlatformConfig>,
): Promise<PlatformConfig> {
  const current = await getPlatformConfig(true);
  const next = mergeWithDefaults({
    ...current,
    ...patch,
    featureFlags: {
      ...current.featureFlags,
      ...(patch.featureFlags ?? {}),
    },
    automationEnabled: {
      ...current.automationEnabled,
      ...(patch.automationEnabled ?? {}),
    },
    mail: {
      ...current.mail,
      ...(patch.mail ?? {}),
    },
    defaultConstructionTrade:
      patch.defaultConstructionTrade !== undefined
        ? normalizeConstructionTrade(patch.defaultConstructionTrade)
        : current.defaultConstructionTrade,
  });

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, configJson: next },
    update: { configJson: next },
  });

  invalidatePlatformConfigCache();
  return next;
}

export async function isFieldCopilotEnabled(): Promise<boolean> {
  const cfg = await getPlatformConfig();
  return cfg.featureFlags.fieldCopilotEnabled !== false && !cfg.maintenanceMode;
}

export async function isAutomationIntentEnabled(intent: AutomationIntent): Promise<boolean> {
  const cfg = await getPlatformConfig();
  if (cfg.maintenanceMode) return false;
  const flag = cfg.automationEnabled[intent];
  return flag !== false;
}

export async function isRegistrationOpen(): Promise<boolean> {
  const cfg = await getPlatformConfig();
  return cfg.registrationOpen && !cfg.maintenanceMode;
}
