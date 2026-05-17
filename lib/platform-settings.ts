import { z } from "zod";
import { AUTOMATION_CATALOG } from "@/lib/os-automations/catalog";
import type { AutomationIntent } from "@/lib/os-automations/types";
import { prisma } from "@/lib/prisma";

const PLATFORM_SETTINGS_ID = "default";

const featureFlagsSchema = z.object({
  meckanoGlobal: z.boolean().default(true),
  geminiLiveEnabled: z.boolean().default(true),
  driveSyncDefault: z.boolean().default(true),
});

export const platformConfigSchema = z.object({
  version: z.number().int().default(1),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().default(""),
  registrationOpen: z.boolean().default(true),
  defaultTrialDays: z.number().int().min(1).max(365).default(30),
  defaultTrialScans: z.number().int().min(0).max(10_000).default(30),
  automationEnabled: z.record(z.string(), z.boolean()).default({}),
  featureFlags: featureFlagsSchema.default({
    meckanoGlobal: true,
    geminiLiveEnabled: true,
    driveSyncDefault: true,
  }),
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
  featureFlags: {
    meckanoGlobal: true,
    geminiLiveEnabled: true,
    driveSyncDefault: true,
  },
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
    featureFlags: {
      ...DEFAULT_PLATFORM_CONFIG.featureFlags,
      ...base.featureFlags,
    },
  };
}

export async function getPlatformConfig(forceRefresh = false): Promise<PlatformConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - cacheAt < CACHE_MS) {
    return cachedConfig;
  }

  const row = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });

  if (!row) {
    await prisma.platformSettings.create({
      data: {
        id: PLATFORM_SETTINGS_ID,
        configJson: DEFAULT_PLATFORM_CONFIG,
      },
    });
    cachedConfig = DEFAULT_PLATFORM_CONFIG;
    cacheAt = now;
    return DEFAULT_PLATFORM_CONFIG;
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
  });

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, configJson: next },
    update: { configJson: next },
  });

  invalidatePlatformConfigCache();
  return next;
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
