import type { MessageTree } from "./keys";
import type { AppLocale } from "./config";
import { normalizeLocale } from "./config";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import ru from "@/messages/ru.json";
import siteMarketingHe from "@/messages/site-marketing.he.json";
import siteMarketingEn from "@/messages/site-marketing.en.json";
import siteMarketingRu from "@/messages/site-marketing.ru.json";
import marketingHomeHe from "@/messages/marketing-home.he.json";
import marketingHomeEn from "@/messages/marketing-home.en.json";
import marketingHomeRu from "@/messages/marketing-home.ru.json";
import brandBriefHe from "@/messages/brand-brief.he.json";
import brandBriefEn from "@/messages/brand-brief.en.json";
import brandBriefRu from "@/messages/brand-brief.ru.json";
import constructionTradesEn from "@/messages/construction-trades.en.json";
import constructionTradesRu from "@/messages/construction-trades.ru.json";
import workspaceShellHe from "@/messages/workspace-shell.he.json";
import workspaceShellEn from "@/messages/workspace-shell.en.json";
import workspaceShellRu from "@/messages/workspace-shell.ru.json";
import workspaceDockHe from "@/messages/workspace-dock.he.json";
import workspaceDockEn from "@/messages/workspace-dock.en.json";
import workspaceDockRu from "@/messages/workspace-dock.ru.json";
import siteChromeHe from "@/messages/site-chrome.he.json";
import siteChromeEn from "@/messages/site-chrome.en.json";
import siteChromeRu from "@/messages/site-chrome.ru.json";
import workspaceAreasHe from "@/messages/workspace-areas.he.json";
import workspaceAreasEn from "@/messages/workspace-areas.en.json";
import workspaceAreasRu from "@/messages/workspace-areas.ru.json";

const PACKS: Record<AppLocale, MessageTree> = {
  en: en as unknown as MessageTree,
  he: he as unknown as MessageTree,
  ru: ru as unknown as MessageTree,
};

function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const key of Object.keys(b)) {
    const bv = b[key];
    const av = a[key];
    if (
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv) &&
      av !== null &&
      typeof av === "object" &&
      !Array.isArray(av)
    ) {
      out[key] = deepMerge(av as Record<string, unknown>, bv as Record<string, unknown>);
    } else {
      out[key] = bv;
    }
  }
  return out;
}

/** תוכן שיווק/דף הבית — קבצים נפרדים לכל שפה */
function siteExtras(locale: AppLocale): Record<string, unknown> {
  if (locale === "he") {
    return deepMerge(
      deepMerge(
        siteMarketingHe as unknown as Record<string, unknown>,
        marketingHomeHe as unknown as Record<string, unknown>,
      ),
      brandBriefHe as unknown as Record<string, unknown>,
    );
  }
  if (locale === "ru") {
    return deepMerge(
      deepMerge(
        siteMarketingRu as unknown as Record<string, unknown>,
        marketingHomeRu as unknown as Record<string, unknown>,
      ),
      brandBriefRu as unknown as Record<string, unknown>,
    );
  }
  return deepMerge(
    deepMerge(
      siteMarketingEn as unknown as Record<string, unknown>,
      marketingHomeEn as unknown as Record<string, unknown>,
    ),
    brandBriefEn as unknown as Record<string, unknown>,
  );
}

/** מרחב עבודה `/app` — ניווט, דף בית ודוק תחתון */
function workspaceExtras(locale: AppLocale): Record<string, unknown> {
  if (locale === "he") {
    return deepMerge(
      workspaceShellHe as unknown as Record<string, unknown>,
      workspaceDockHe as unknown as Record<string, unknown>,
    );
  }
  if (locale === "ru") {
    return deepMerge(
      workspaceShellRu as unknown as Record<string, unknown>,
      workspaceDockRu as unknown as Record<string, unknown>,
    );
  }
  return deepMerge(
    workspaceShellEn as unknown as Record<string, unknown>,
    workspaceDockEn as unknown as Record<string, unknown>,
  );
}

/** פוטר ציבורי, פלטת פקודות ומחרוזות כרום כלליות */
function siteChromeExtras(locale: AppLocale): Record<string, unknown> {
  if (locale === "he") return siteChromeHe as unknown as Record<string, unknown>;
  if (locale === "ru") return siteChromeRu as unknown as Record<string, unknown>;
  return siteChromeEn as unknown as Record<string, unknown>;
}

function workspaceAreasExtras(locale: AppLocale): Record<string, unknown> {
  if (locale === "he") return workspaceAreasHe as unknown as Record<string, unknown>;
  if (locale === "ru") return workspaceAreasRu as unknown as Record<string, unknown>;
  return workspaceAreasEn as unknown as Record<string, unknown>;
}

export function getMessages(locale: string): MessageTree {
  const code = normalizeLocale(locale) as AppLocale;
  const base = PACKS[code] ?? PACKS.en;
  const extra = siteExtras(code);
  const tradePack =
    code === "en"
      ? (constructionTradesEn as unknown as Record<string, unknown>)
      : code === "ru"
        ? (constructionTradesRu as unknown as Record<string, unknown>)
        : {};
  let merged = deepMerge(base as unknown as Record<string, unknown>, extra);
  merged = deepMerge(merged, tradePack);
  merged = deepMerge(merged, workspaceExtras(code));
  merged = deepMerge(merged, siteChromeExtras(code));
  merged = deepMerge(merged, workspaceAreasExtras(code));
  return merged as MessageTree;
}

export function getMessagesForLocale(locale: AppLocale): MessageTree {
  return getMessages(locale);
}
