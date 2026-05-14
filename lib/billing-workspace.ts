import { planPriceIls } from "@/lib/subscription-plans";

export type InsuranceExpenseLine = { label: string; amountNis: number };

/** כפתור תשלום מהיר בדף החיוב — ניתן לעריכה בהגדרות › מנויים */
export type QuickPaymentPreset = {
  label: string;
  amountNis: number;
  /** תיאור בחשבונית; אם חסר — נגזר מהתווית */
  invoiceDescription?: string;
};

export type BillingWorkspaceV1 = {
  v: 1;
  insuranceLines: InsuranceExpenseLine[];
  /** 1–5 חום המלצה, או none */
  referralLevel: "none" | "1" | "2" | "3" | "4" | "5";
  referralNotes: string;
  /** מה לומר לחבר לפני שמזמינים אותו — חינם + PayPal */
  onboardingFreePitch: string;
  /** עד 10 כפתורי גבייה מהירה; אם המפתח חסר ב־JSON — ברירת מחדל */
  quickPaymentPresets: QuickPaymentPreset[];
};

export const DEFAULT_BILLING_WORKSPACE: BillingWorkspaceV1 = {
  v: 1,
  insuranceLines: [],
  referralLevel: "none",
  referralNotes: "",
  onboardingFreePitch:
    "הקמתי לך חשבון ב־BSD-YBM — הכניסה והשימוש הבסיסי חינם. כשתרצה לשדרג מנוי או לשלם על שירות, התשלום מאובטח דרך PayPal לפי הקישור שאשלח.",
  quickPaymentPresets: [],
};

/** ברירת מחדל שאנחנו בוחרים — עד שמירה ראשונה בהגדרות נטען אוטומטית */
export function defaultQuickPaymentPresets(): QuickPaymentPreset[] {
  const pro = planPriceIls("PRO");
  const bus = planPriceIls("BUSINESS");
  const list: QuickPaymentPreset[] = [
    {
      label: "₪10 — בקשת גבייה",
      amountNis: 10,
      invoiceDescription: "תשלום חד-פעמי ₪10",
    },
    {
      label: "₪99 — שירות / ייעוץ קצר",
      amountNis: 99,
      invoiceDescription: "בקשת תשלום ₪99 — שירות / ייעוץ",
    },
  ];
  if (pro != null) {
    list.push({
      label: `₪${pro} — כמו Pro (חד-פעמי)`,
      amountNis: pro,
      invoiceDescription: `בקשת תשלום חד-פעמית בסכום מחירון Pro (₪${pro}) — לא מנוי מחודש`,
    });
  }
  if (bus != null) {
    list.push({
      label: `₪${bus} — כמו Business (חד-פעמי)`,
      amountNis: bus,
      invoiceDescription: `בקשת תשלום חד-פעמית בסכום מחירון Business (₪${bus}) — לא מנוי מחודש`,
    });
  }
  return list;
}

const PRESET_AMT_MIN = 1;
const PRESET_AMT_MAX = 100_000;

export function parseQuickPaymentPresetsArray(raw: unknown): QuickPaymentPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickPaymentPreset[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? "").trim().slice(0, 120);
    const amt = Number(row.amountNis);
    if (!label || !Number.isFinite(amt)) continue;
    const amountNis = Math.round(amt * 100) / 100;
    if (amountNis < PRESET_AMT_MIN || amountNis > PRESET_AMT_MAX) continue;
    const invoiceDescription = String(row.invoiceDescription ?? "").trim().slice(0, 300);
    out.push({
      label,
      amountNis,
      invoiceDescription: invoiceDescription || undefined,
    });
  }
  return out;
}

export function parseBillingWorkspace(raw: unknown): BillingWorkspaceV1 {
  const base: BillingWorkspaceV1 = {
    ...DEFAULT_BILLING_WORKSPACE,
    quickPaymentPresets: defaultQuickPaymentPresets(),
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;

  let quickPaymentPresets: QuickPaymentPreset[];
  if (!("quickPaymentPresets" in o)) {
    quickPaymentPresets = defaultQuickPaymentPresets();
  } else {
    const arr = o.quickPaymentPresets;
    quickPaymentPresets = Array.isArray(arr) ? parseQuickPaymentPresetsArray(arr) : defaultQuickPaymentPresets();
  }

  const linesRaw = o.insuranceLines;
  const insuranceLines: InsuranceExpenseLine[] = [];
  if (Array.isArray(linesRaw)) {
    for (const item of linesRaw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const label = String(row.label ?? "").trim().slice(0, 200);
      const amt = Number(row.amountNis);
      if (!label || !Number.isFinite(amt) || amt < 0) continue;
      insuranceLines.push({ label, amountNis: Math.round(amt * 100) / 100 });
    }
  }

  const ref = String(o.referralLevel ?? "none");
  const referralLevel =
    ref === "1" || ref === "2" || ref === "3" || ref === "4" || ref === "5" || ref === "none"
      ? ref
      : "none";

  return {
    v: 1,
    insuranceLines,
    referralLevel,
    referralNotes: String(o.referralNotes ?? "").slice(0, 4000),
    onboardingFreePitch: String(o.onboardingFreePitch ?? base.onboardingFreePitch).slice(0, 4000),
    quickPaymentPresets,
  };
}

export function sumInsuranceLines(lines: InsuranceExpenseLine[]): number {
  return lines.reduce((s, l) => s + (Number.isFinite(l.amountNis) ? l.amountNis : 0), 0);
}
