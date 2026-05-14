import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  Globe,
  LayoutDashboard,
  ShieldCheck,
  User,
  Workflow,
  Wrench,
} from "lucide-react";

export const SETTINGS_HUB_SEGMENT_IDS = [
  "overview",
  "profile",
  "organization",
  "profession",
  "presence",
  "stack",
  "billing",
  "automations",
  "operations",
  "platform",
] as const;

export type SettingsHubSegmentId = (typeof SETTINGS_HUB_SEGMENT_IDS)[number];

export const SETTINGS_HUB_CORE_SEGMENT_IDS = [
  "overview",
  "organization",
  "profession",
  "presence",
  "stack",
] as const;

export type SettingsHubCoreSegmentId = (typeof SETTINGS_HUB_CORE_SEGMENT_IDS)[number];

export type SettingsHubNavItem = {
  id: SettingsHubSegmentId;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  platformAdminOnly?: boolean;
};

export type SettingsHubNavGroup = {
  id: string;
  title: string;
  items: SettingsHubNavItem[];
};

const BASE = "/app/settings";

export const SETTINGS_HUB_NAV_GROUPS: readonly SettingsHubNavGroup[] = [
  {
    id: "foundation",
    title: "בסיס המערכת",
    items: [
      {
        id: "overview",
        href: `${BASE}/overview`,
        label: "סקירה",
        description: "מצב הגדרות, השלמות וקיצורי דרך",
        icon: LayoutDashboard,
      },
      {
        id: "profile",
        href: `${BASE}/profile`,
        label: "פרופיל משתמש",
        description: "זהות, תפקיד והרשאות גישה",
        icon: User,
      },
      {
        id: "organization",
        href: `${BASE}/organization`,
        label: "ארגון ומיסוי",
        description: "שם עסק, ח.פ, כתובת וצוות",
        icon: Building2,
      },
      {
        id: "profession",
        href: `${BASE}/profession`,
        label: "תחום בניה",
        description: "התמחות, שפה מקצועית ותבניות",
        icon: BriefcaseBusiness,
      },
    ],
  },
  {
    id: "digital",
    title: "מנועים ונוכחות",
    items: [
      {
        id: "presence",
        href: `${BASE}/presence`,
        label: "פורטל וגבייה",
        description: "מיתוג, דומיין וחיבורי לקוחות",
        icon: Globe,
      },
      {
        id: "stack",
        href: `${BASE}/stack`,
        label: "מנועי AI וחיבורים",
        description: "Document AI, Gemini, OpenAI, ענן וגיבוי",
        icon: Bot,
      },
    ],
  },
  {
    id: "operations",
    title: "תפעול ומסחר",
    items: [
      {
        id: "billing",
        href: `${BASE}/billing`,
        label: "מנוי וחיוב",
        description: "מסלול BSD-YBM, מכסות ותשלום",
        icon: CreditCard,
      },
      {
        id: "automations",
        href: `${BASE}/automations`,
        label: "אוטומציות",
        description: "תהליכים בין CRM, ERP וסריקה",
        icon: Workflow,
      },
      {
        id: "operations",
        href: `${BASE}/operations`,
        label: "תפעול שטח",
        description: "יומנים, צוותים, Meckano ותורים",
        icon: Wrench,
      },
    ],
  },
  {
    id: "platform",
    title: "ניהול המערכת",
    items: [
      {
        id: "platform",
        href: `${BASE}/platform`,
        label: "בקרת מערכת",
        description: "בריאות שירות, מנויים ושידורים",
        icon: ShieldCheck,
        platformAdminOnly: true,
      },
    ],
  },
];

const LEGACY_TAB_TO_SEGMENT: Readonly<Record<string, SettingsHubSegmentId>> = {
  overview: "overview",
  organization: "organization",
  org: "organization",
  profile: "profile",
  profession: "profession",
  trade: "profession",
  presence: "presence",
  portal: "presence",
  billing: "billing",
  subscription: "billing",
  ai: "stack",
  stack: "stack",
  integrations: "stack",
  meckano: "stack",
  automations: "automations",
  operations: "operations",
  platform: "platform",
};

export function legacyTabToSegment(tab: string | undefined | null): SettingsHubSegmentId | null {
  const normalized = String(tab ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return LEGACY_TAB_TO_SEGMENT[normalized] ?? null;
}

export function settingsHubPath(segment: SettingsHubSegmentId): string {
  return `${BASE}/${segment}`;
}

export function flattenSettingsHubNav(includeOSItems: boolean): SettingsHubNavItem[] {
  return SETTINGS_HUB_NAV_GROUPS.flatMap((group) =>
    group.items.filter((item) => includeOSItems || !item.platformAdminOnly),
  );
}

export function getSettingsHubNavItem(
  segment: SettingsHubSegmentId,
  includeOSItems: boolean,
): SettingsHubNavItem | undefined {
  return flattenSettingsHubNav(includeOSItems).find((item) => item.id === segment);
}
