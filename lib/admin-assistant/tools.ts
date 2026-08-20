import { tool } from "ai";
import { getAdminEnvStatusRecord } from "@/lib/admin/env-status";
import { z } from "zod";
import { listPendingRegistrationsAction } from "@/app/actions/admin-console";
import { manageSubsListOrganizationsAction } from "@/app/actions/manage-subscriptions";
import { getAdminSystemHealth } from "@/lib/admin-assistant/system-health";
import { getPlatformConfig } from "@/lib/platform-settings";
import {
  createPendingAction,
  getAdminAssistantRequestEmail,
} from "@/lib/admin-assistant/pending-actions";

export type AdminNavigationHint = {
  tabId: string;
  hint: string;
};

let lastNavigationHint: AdminNavigationHint | null = null;

export function consumeAdminNavigationHint(): AdminNavigationHint | null {
  const hint = lastNavigationHint;
  lastNavigationHint = null;
  return hint;
}


const CAPABILITY_TEXT: Record<string, string> = {
  subscriptions:
    "טאב מנויים: עריכת tier, סטטוס, מגבלות סריקה, מחיקת ארגון, יצירת ארגון ידני.",
  pending: "טאב הרשמות: אישור או דחייה של בקשות הרשמה חדשות.",
  users: "טאב משתמשים: חיפוש משתמש, הקצאת תפקיד, provision למשתמש חדש.",
  broadcast: "טאב שידורים: שליחת התראת push לכל המשתמשים.",
  health: "טאב בריאות: בדיקת חיבור DB, AI, מייל ותשלומים.",
  settings: "טאב הגדרות: מצב תחזוקה, הרשמה, אוטומציות, דגלים.",
  assistant: "עוזר ניהול: שאלות על המערכת עם כלים לקריאה בלבד.",
};

export const adminAssistantTools = {
  get_system_health: tool({
    description: "מחזיר סטטוס בריאות שירותי הפלטפורמה",
    inputSchema: z.object({}),
    execute: async () => getAdminSystemHealth(),
  }),

  get_env_status: tool({
    description: "מחזיר שמות משתני סביבה קריטיים והאם הוגדרו (ללא ערכים)",
    inputSchema: z.object({}),
    execute: async () => ({ envStatus: getAdminEnvStatusRecord() }),
  }),

  get_platform_settings_summary: tool({
    description: "סיכום הגדרות פלטפורמה ללא מפתחות",
    inputSchema: z.object({}),
    execute: async () => {
      const config = await getPlatformConfig(false);
      return {
        maintenanceMode: config.maintenanceMode,
        registrationOpen: config.registrationOpen,
        defaultTrialDays: config.defaultTrialDays,
        defaultTrialScans: config.defaultTrialScans,
        defaultConstructionTrade: config.defaultConstructionTrade,
        featureFlags: config.featureFlags,
        automationEnabledCount: Object.values(config.automationEnabled).filter(Boolean).length,
      };
    },
  }),

  list_orgs_summary: tool({
    description: "סיכום ארגונים: מספר, tier, סטטוס",
    inputSchema: z.object({}),
    execute: async () => {
      const data = await manageSubsListOrganizationsAction();
      if ("error" in data) return { error: data.error };
      const byTier: Record<string, number> = {};
      for (const o of data) {
        byTier[o.subscriptionTier] = (byTier[o.subscriptionTier] ?? 0) + 1;
      }
      return {
        total: data.length,
        byTier,
        sample: data.slice(0, 8).map((o) => ({
          id: o.id,
          name: o.name,
          tier: o.subscriptionTier,
          status: o.subscriptionStatus,
        })),
      };
    },
  }),

  list_pending_registrations: tool({
    description: "רשימת הרשמות ממתינות לאישור",
    inputSchema: z.object({}),
    execute: async () => {
      const data = await listPendingRegistrationsAction();
      if ("error" in data) return { error: data.error };
      return {
        count: data.length,
        items: data.slice(0, 15).map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          createdAt: r.createdAt,
        })),
      };
    },
  }),

  navigate_admin_tab: tool({
    description: "מציע למנהל לעבור לטאב בקונסולת הניהול",
    inputSchema: z.object({
      tabId: z.enum([
        "subscriptions",
        "pending",
        "users",
        "broadcast",
        "health",
        "settings",
        "assistant",
      ]),
      hint: z.string().optional(),
    }),
    execute: async ({ tabId, hint }) => {
      lastNavigationHint = {
        tabId,
        hint: hint ?? `עבור לטאב ${tabId}`,
      };
      return { ok: true, tabId, message: `הצעה: לפתוח את טאב ${tabId} בממשק הניהול.` };
    },
  }),

  explain_capability: tool({
    description: "הסבר על יכולת או טאב בניהול המערכת",
    inputSchema: z.object({
      topic: z.string().describe("שם הטאב או הנושא"),
    }),
    execute: async ({ topic }) => {
      const key = topic.trim().toLowerCase();
      const text = CAPABILITY_TEXT[key] ?? "נושא לא מוכר. טאבים: subscriptions, pending, users, broadcast, health, settings, assistant.";
      return { topic, explanation: text };
    },
  }),

  propose_subscription_update: tool({
    description:
      "מציע עדכון מנוי לארגון — לא מבצע ישירות; מחזיר actionId לאישור מנהל בממשק",
    inputSchema: z.object({
      organizationId: z.string().min(1),
      tier: z.string().min(1),
      subscriptionStatus: z.string().min(1),
    }),
    execute: async ({ organizationId, tier, subscriptionStatus }) => {
      const pending = createPendingAction(
        {
          type: "subscription_update",
          organizationId,
          tier,
          subscriptionStatus,
        },
        getAdminAssistantRequestEmail() || "unknown",
      );
      return {
        requiresApproval: true,
        actionId: pending.actionId,
        token: pending.token,
        summary: pending.summary,
        message: "המנהל צריך לאשר את העדכון בכרטיס האישור לפני ביצוע.",
      };
    },
  }),

  propose_broadcast: tool({
    description:
      "מציע שידור התראה לכל המשתמשים — לא שולח ישירות; מחזיר actionId לאישור מנהל",
    inputSchema: z.object({
      title: z.string().min(1).max(160),
      body: z.string().min(1).max(4000),
    }),
    execute: async ({ title, body }) => {
      const pending = createPendingAction(
        { type: "broadcast", title, body },
        getAdminAssistantRequestEmail() || "unknown",
      );
      return {
        requiresApproval: true,
        actionId: pending.actionId,
        token: pending.token,
        summary: pending.summary,
        message: "המנהל צריך לאשר את השידור בכרטיס האישור לפני שליחה.",
      };
    },
  }),
};
