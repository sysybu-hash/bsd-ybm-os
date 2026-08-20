import type { WidgetType } from "@/hooks/use-window-manager";

export type HelpGuideStep = {
  title: string;
  body: string;
};

export type HelpFaqItem = {
  question: string;
  answer: string;
};

export type HelpGuide = {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  readMinutes: number;
  steps: HelpGuideStep[];
  tips?: string[];
  omnibarExamples?: string[];
  openWidget?: WidgetType;
  /** Optional liveData (e.g. hub tab) when opening the related screen */
  openWidgetData?: Record<string, unknown>;
};

export type HelpCategory = {
  id: string;
  title: string;
  description: string;
  guideIds: string[];
};

export type HelpCenterData = {
  categories: HelpCategory[];
  guides: HelpGuide[];
  globalFaq: HelpFaqItem[];
};
