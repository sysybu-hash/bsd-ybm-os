import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Briefcase,
  Calendar,
  FileText,
  HardHat,
  Layers,
  LayoutGrid,
  Mic,
  ScanLine,
  Wallet,
} from "lucide-react";

export type BentoModule = Readonly<{
  titleKey: string;
  bodyKey: string;
  icon: LucideIcon;
}>;

export const BENTO_MODULES: readonly BentoModule[] = [
  {
    titleKey: "marketingHome.editorial.projectCards.0.title",
    bodyKey: "marketingHome.modules.0.body",
    icon: Briefcase,
  },
  {
    titleKey: "marketingHome.editorial.projectCards.1.title",
    bodyKey: "marketingHome.modules.0.body",
    icon: FileText,
  },
  {
    titleKey: "marketingHome.editorial.projectCards.2.title",
    bodyKey: "marketingHome.features.1.body",
    icon: Wallet,
  },
  {
    titleKey: "marketingHome.editorial.projectCards.3.title",
    bodyKey: "marketingHome.modules.1.body",
    icon: HardHat,
  },
  {
    titleKey: "marketingHome.editorial.projectCards.4.title",
    bodyKey: "marketingHome.modules.2.body",
    icon: BarChart3,
  },
  {
    titleKey: "marketingHome.editorial.projectCards.5.title",
    bodyKey: "marketingHome.modules.3.body",
    icon: Bot,
  },
  {
    titleKey: "marketingHome.osLanding.features.0.title",
    bodyKey: "marketingHome.osLanding.features.0.body",
    icon: ScanLine,
  },
  {
    titleKey: "marketingHome.osLanding.features.1.title",
    bodyKey: "marketingHome.osLanding.features.1.body",
    icon: Mic,
  },
  {
    titleKey: "marketingHome.cinematic.bentoNotebook.title",
    bodyKey: "marketingHome.cinematic.bentoNotebook.body",
    icon: Layers,
  },
  {
    titleKey: "marketingHome.cinematic.bentoCalendar.title",
    bodyKey: "marketingHome.cinematic.bentoCalendar.body",
    icon: Calendar,
  },
  {
    titleKey: "marketingHome.cinematic.bentoAppBuilder.title",
    bodyKey: "marketingHome.cinematic.bentoAppBuilder.body",
    icon: LayoutGrid,
  },
] as const;
