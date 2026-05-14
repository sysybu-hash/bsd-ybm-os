import { prisma } from "@/lib/prisma";
import { OS_UNLIMITED_CREDITS } from "@/lib/platform-developers";
import { tierAllowance } from "@/lib/subscription-tier-config";

export type ScanType = "CHEAP" | "PREMIUM";

export type ScanUsageWarningId = "cheap_80" | "premium_80";

function isUnlimitedScans(n: number): boolean {
  return n >= 1_000_000_000 || n === OS_UNLIMITED_CREDITS;
}

/** אחרי ניכוי — האם נותרו ≤20% מהמכסה הבסיסית של הרמה (אזהרת ~80% ניצול) */
export function scanUsageThresholdWarnings(args: {
  subscriptionTier: string;
  cheapScansRemaining: number;
  premiumScansRemaining: number;
}): ScanUsageWarningId[] {
  const a = tierAllowance(args.subscriptionTier);
  const out: ScanUsageWarningId[] = [];
  if (a.cheapScans > 0) {
    const threshold = Math.ceil(a.cheapScans * 0.2);
    if (args.cheapScansRemaining > 0 && args.cheapScansRemaining <= threshold) {
      out.push("cheap_80");
    }
  }
  if (a.premiumScans > 0) {
    const threshold = Math.ceil(a.premiumScans * 0.2);
    if (args.premiumScansRemaining > 0 && args.premiumScansRemaining <= threshold) {
      out.push("premium_80");
    }
  }
  return out;
}

/**
 * מנכה סריקה אחת (לא כולל מפתחי המערכת — טפלו בזה לפני הקריאה).
 * VIP ומכסות „ללא הגבלה” — ללא ניכוי.
 */
export async function decrementScan(
  organizationId: string,
  scanType: ScanType,
): Promise<
  | {
      ok: true;
      cheapScansRemaining: number;
      premiumScansRemaining: number;
      usageWarnings: ScanUsageWarningId[];
      skippedBecauseVip?: boolean;
      skippedBecauseUnlimited?: boolean;
    }
  | { ok: false; error: string; code?: "QUOTA_EXCEEDED" }
> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      isVip: true,
      cheapScansRemaining: true,
      premiumScansRemaining: true,
      subscriptionTier: true,
    },
  });
  if (!org) return { ok: false, error: "ארגון לא נמצא" };

  if (org.isVip) {
    return {
      ok: true,
      cheapScansRemaining: org.cheapScansRemaining,
      premiumScansRemaining: org.premiumScansRemaining,
      usageWarnings: [],
      skippedBecauseVip: true,
    };
  }

  const balance =
    scanType === "PREMIUM" ? org.premiumScansRemaining : org.cheapScansRemaining;
  if (isUnlimitedScans(balance)) {
    return {
      ok: true,
      cheapScansRemaining: org.cheapScansRemaining,
      premiumScansRemaining: org.premiumScansRemaining,
      usageWarnings: [],
      skippedBecauseUnlimited: true,
    };
  }

  if (balance <= 0) {
    return {
      ok: false,
      code: "QUOTA_EXCEEDED",
      error:
        scanType === "PREMIUM"
          ? "נגמרה מכסת הסריקות הפרימיום. ניתן לרכוש בנדל או לשדרג מנוי בדף החיוב."
          : "נגמרה מכסת הסריקות. ניתן לרכוש בנדל סריקות או לשדרג מנוי בדף החיוב.",
    };
  }

  const field =
    scanType === "PREMIUM" ? "premiumScansRemaining" : "cheapScansRemaining";

  await prisma.organization.update({
    where: { id: organizationId },
    data: { [field]: { decrement: 1 } },
  });

  const newCheap =
    scanType === "CHEAP" ? balance - 1 : org.cheapScansRemaining;
  const newPrem =
    scanType === "PREMIUM" ? balance - 1 : org.premiumScansRemaining;

  const usageWarnings = scanUsageThresholdWarnings({
    subscriptionTier: org.subscriptionTier,
    cheapScansRemaining: newCheap,
    premiumScansRemaining: newPrem,
  });

  return {
    ok: true,
    cheapScansRemaining: newCheap,
    premiumScansRemaining: newPrem,
    usageWarnings,
  };
}
