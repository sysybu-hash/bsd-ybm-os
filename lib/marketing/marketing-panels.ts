import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  Building2,
  GitBranch,
  Layers,
  Mail,
  ListChecks,
  MessageSquare,
  Sparkles,
  Wallet,
} from "lucide-react";

export const MARKETING_PANEL_IDS = [
  "modules",
  "workflow",
  "industries",
  "why",
  "pricing",
  "principles",
  "feedback",
  "contact",
  "modularity",
] as const;

export type MarketingPanelId = (typeof MARKETING_PANEL_IDS)[number];

export type MarketingPanelDef = Readonly<{
  id: MarketingPanelId;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}>;

export const MARKETING_EXPLORE_PANELS: readonly MarketingPanelDef[] = [
  {
    id: "modules",
    titleKey: "marketingHome.panels.modules.title",
    descriptionKey: "marketingHome.panels.modules.description",
    icon: Layers,
  },
  {
    id: "workflow",
    titleKey: "marketingHome.panels.workflow.title",
    descriptionKey: "marketingHome.panels.workflow.description",
    icon: GitBranch,
  },
  {
    id: "industries",
    titleKey: "marketingHome.panels.industries.title",
    descriptionKey: "marketingHome.panels.industries.description",
    icon: Building2,
  },
  {
    id: "why",
    titleKey: "marketingHome.panels.why.title",
    descriptionKey: "marketingHome.panels.why.description",
    icon: Sparkles,
  },
  {
    id: "pricing",
    titleKey: "marketingHome.panels.pricing.title",
    descriptionKey: "marketingHome.panels.pricing.description",
    icon: Wallet,
  },
  {
    id: "principles",
    titleKey: "marketingHome.panels.principles.title",
    descriptionKey: "marketingHome.panels.principles.description",
    icon: ListChecks,
  },
  {
    id: "feedback",
    titleKey: "marketingHome.panels.feedback.title",
    descriptionKey: "marketingHome.panels.feedback.description",
    icon: MessageSquare,
  },
  {
    id: "contact",
    titleKey: "marketingHome.panels.contact.title",
    descriptionKey: "marketingHome.panels.contact.description",
    icon: Mail,
  },
  {
    id: "modularity",
    titleKey: "marketingHome.panels.modularity.title",
    descriptionKey: "marketingHome.panels.modularity.description",
    icon: Blocks,
  },
] as const;

/** ניווט עליון — תת-תפריטים מרכזיים */
export const MARKETING_NAV_PANELS: readonly MarketingPanelDef[] = MARKETING_EXPLORE_PANELS.filter(
  (p) => p.id !== "feedback",
);
