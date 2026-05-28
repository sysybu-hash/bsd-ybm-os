import type { AppLocale } from "@/lib/i18n/config";

import {

  buildMarketingPublicUrls,

  buildMarketingSiteRulesBlock,

  type MarketingSitePromptContext,

} from "@/lib/marketing/canonical-site";

import { buildMarketingLandingKnowledge } from "@/lib/marketing/landing-knowledge";

import { SITE_CONTACT } from "@/lib/site-contact";



const LOCALE_REPLY: Record<AppLocale, string> = {

  he: "ענה תמיד בעברית, בשפה קלה ונעימה — כמו שיחה עם אדם, לא כמו מצגת שיווקית.",

  en: "Always reply in English, in warm plain language — like a helpful conversation, not a sales deck.",

  ru: "Всегда отвечайте по-русски, простым и дружелюбным языком.",

};



function voiceEnding(locale: AppLocale): string {

  const byLocale: Record<AppLocale, string> = {

    he: "לפני סגירת השיחה (ב-120 שניות) סכם בשני משפטים בניחותא. אם מתאים — הזמן לפתוח חשבון, בלי לחזור על כתובת האתר.",

    en: "Before the 120-second cutoff, give a brief friendly wrap-up. Invite signup only if natural — do not repeat the website URL.",

    ru: "До 120 секунд — короткое дружелюбное резюме. Приглашение к регистрации только если уместно, без повторения URL сайта.",

  };

  return byLocale[locale];

}



export function buildMarketingLandingSystemInstruction(

  locale: AppLocale,

  mode: "chat" | "voice",

  siteContext?: MarketingSitePromptContext,

): string {

  const knowledge = buildMarketingLandingKnowledge(locale);

  const urls = buildMarketingPublicUrls();

  const siteRules = buildMarketingSiteRulesBlock(locale, siteContext);



  const rules = [

    "You are the public marketing assistant on the BSD-YBM OS landing page (visitor is NOT logged in).",

    "You are NOT the in-app workspace assistant. Never say 'בסביבת העבודה' or 'in your workspace'.",

    "SCOPE: product value, modules, workflow, industries, pricing — ONLY from the knowledge below.",

    "TONE: warm, clear, modest. No hype, no fake testimonials, no repeating the same URL every turn.",

    `Contact: email ${SITE_CONTACT.email}, WhatsApp ${SITE_CONTACT.phone.e164}. Address and hours are in the knowledge block.`,

    "FORBIDDEN: customer/org data, executing commands, internal APIs, pretending to open real account screens.",

    "If asked for internal data or actions, explain this is a public demo and suggest opening an account when relevant.",

    "Do not fabricate pricing beyond listed tiers.",

    LOCALE_REPLY[locale],

    "",

    siteRules,

    mode === "voice"

      ? [

          "VOICE MODE: Short answers (1–3 sentences). Natural spoken language.",

          "Do NOT read URLs aloud unless the user explicitly asks for a link.",

          voiceEnding(locale),

        ].join("\n")

      : [

          "TEXT MODE: Short paragraphs or bullets when helpful.",

          "Mention signup/login links only when the user asks how to start or at the end of a long answer — not in every reply.",

          `When a link is needed, use ${urls.register} or ${urls.login}.`,

        ].join("\n"),

    "",

    "=== MARKETING PAGE KNOWLEDGE ===",

    knowledge,

  ];



  return rules.join("\n");

}

