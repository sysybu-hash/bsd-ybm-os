import type { AppLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";
import { buildMarketingPublicUrls } from "@/lib/marketing/canonical-site";
import {
  SITE_CONTACT,
  siteContactAddress,
  siteContactAvailability,
  siteContactPhoneDisplay,
  siteContactWhatsAppUrl,
} from "@/lib/site-contact";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function linesFromPairs(items: Array<{ title: string; body: string }>): string[] {
  return items
    .filter((item) => item.title || item.body)
    .map((item) => (item.body ? `${item.title}: ${item.body}` : item.title));
}

function collectTierLines(pricing: JsonRecord | null): string[] {
  const tiers = pricing?.tiers;
  if (!Array.isArray(tiers)) return [];
  return tiers.flatMap((tier) => {
    const row = asRecord(tier);
    if (!row) return [];
    const name = asString(row.name);
    const price = asString(row.price);
    const body = asString(row.body);
    const points = Array.isArray(row.points)
      ? row.points.map((p) => asString(p)).filter(Boolean)
      : [];
    return [
      name ? `• ${name}${price ? ` — ${price}` : ""}` : "",
      body,
      ...points.map((p) => `  - ${p}`),
    ].filter(Boolean);
  });
}

/** תמצית תוכן דף השיווק בלבד — לשימוש ב-AI (טקסט + קול). */
export function buildMarketingLandingKnowledge(locale: AppLocale): string {
  const messages = getMessages(locale) as Record<string, unknown>;
  const mh = asRecord(messages.marketingHome);
  const mp = asRecord(messages.marketingPricing);
  const mprod = asRecord(messages.marketingProduct);

  const hero = asRecord(mh?.hero);
  const modulesSection = asRecord(mh?.modulesSection);
  const workflow = asRecord(mh?.workflow);
  const industries = asRecord(mh?.industries);
  const why = asRecord(mh?.why);
  const cta = asRecord(mh?.cta);
  const cinematic = asRecord(mh?.cinematic);
  const osLanding = asRecord(mh?.osLanding);

  const features = Array.isArray(mh?.features)
    ? mh.features.map((f) => {
        const row = asRecord(f);
        return { title: asString(row?.title), body: asString(row?.body) };
      })
    : [];

  const modules = Array.isArray(mh?.modules)
    ? mh.modules.map((m) => {
        const row = asRecord(m);
        return { title: asString(row?.title), body: asString(row?.body) };
      })
    : [];

  const workflowSteps = Array.isArray(workflow?.steps)
    ? workflow.steps.map((s) => asString(s)).filter(Boolean)
    : [];

  const industryTags = Array.isArray(industries?.tags)
    ? industries.tags.map((t) => asString(t)).filter(Boolean)
    : [];

  const whyRows = Array.isArray(why?.rows)
    ? why.rows.map((r) => {
        const row = asRecord(r);
        return { title: asString(row?.title), body: asString(row?.body) };
      })
    : [];

  const proofPoints = Array.isArray(mh?.proofPoints)
    ? mh.proofPoints.map((p) => asString(p)).filter(Boolean)
    : [];

  const osFeatures = Array.isArray(osLanding?.features)
    ? osLanding.features.map((f) => {
        const row = asRecord(f);
        return { title: asString(row?.title), body: asString(row?.body) };
      })
    : [];

  const productModules = mprod?.modules
    ? Object.values(asRecord(mprod.modules) ?? {}).flatMap((mod) => {
        const row = asRecord(mod);
        if (!row) return [];
        return [{ title: asString(row.title), body: asString(row.body) }];
      })
    : [];

  const urls = buildMarketingPublicUrls();

  const contactBlock = [
    "=== Contact ===",
    `Email: ${SITE_CONTACT.email}`,
    `WhatsApp: ${siteContactPhoneDisplay(locale)} (${siteContactWhatsAppUrl()})`,
    `Address: ${siteContactAddress(locale)}`,
    siteContactAvailability(locale),
  ];

  const sections: string[] = [
    "=== BSD-YBM OS — marketing landing page (public demo) ===",
    `Links (mention only when asked): signup ${urls.register} | login ${urls.login}`,
    "",
    ...contactBlock,
    "",
    "=== What the platform does (answer feature questions from this list) ===",
    "• CRM: clients, tasks, reminders, statuses in one place",
    "• Documents: scan, extract, classify, generate business documents",
    "• Billing & finance: invoices, collections, subscriptions, cashflow tracking",
    "• Operational control: tasks, workflows, internal processes, action alerts",
    "• Management insights: live revenue, workload, exceptions, opportunities",
    "• Unified AI layer: AI Hub (chat, notebook, app builder), idea engine, Composer workspaces, platform actions (CRM, scan, invoices, tasks)",
    "• App builder: custom forms, tables, dashboards and Composer — or natural-language commands to run the OS",
    "• Smart documents module + field copilot (voice) for site/field teams",
    "• Notebook & calendar integrations (shown on marketing page)",
    "• Workflow: intake → context & risks → CRM/docs/billing update → team gets next action",
    hero?.titleLine1 && hero?.titleLine2
      ? `Headline: ${asString(hero.titleLine1)} ${asString(hero.titleLine2)}`
      : "",
    hero?.subtitle ? `Subtitle: ${asString(hero.subtitle)}` : "",
    "",
    "Core features:",
    ...linesFromPairs(features),
    "",
    modulesSection?.title ? `Modules section: ${asString(modulesSection.title)}` : "",
    asString(modulesSection?.body),
    ...linesFromPairs(modules),
    "",
    workflow?.title ? `Workflow: ${asString(workflow.title)}` : "",
    asString(workflow?.lead),
    ...workflowSteps.map((s, i) => `${i + 1}. ${s}`),
    "",
    industries?.title ? `Industries: ${asString(industries.title)}` : "",
    asString(industries?.body),
    industryTags.length ? `Tags: ${industryTags.join(" · ")}` : "",
    "",
    why?.title ? `Why: ${asString(why.title)}` : "",
    ...linesFromPairs(whyRows),
    "",
    "Proof points:",
    ...proofPoints.map((p) => `• ${p}`),
    "",
    mp?.title ? `Pricing: ${asString(mp.title)}` : "",
    asString(mp?.description),
    ...collectTierLines(mp),
    "",
    "Product modules (marketing):",
    ...linesFromPairs(productModules),
    "",
    "OS landing highlights:",
    ...linesFromPairs(osFeatures),
    "",
    cinematic?.fieldCopilotTitle
      ? `Field Copilot demo: ${asString(cinematic.fieldCopilotTitle)} — ${asString(cinematic.fieldCopilotResult)}`
      : "",
    cinematic?.bentoNotebook
      ? (() => {
          const nb = asRecord(cinematic.bentoNotebook);
          return nb ? `Notebook: ${asString(nb.title)} — ${asString(nb.body)}` : "";
        })()
      : "",
    cinematic?.bentoCalendar
      ? (() => {
          const cal = asRecord(cinematic.bentoCalendar);
          return cal ? `Calendar: ${asString(cal.title)} — ${asString(cal.body)}` : "";
        })()
      : "",
    cinematic?.bentoAppBuilder
      ? (() => {
          const ab = asRecord(cinematic.bentoAppBuilder);
          return ab ? `App builder: ${asString(ab.title)} — ${asString(ab.body)}` : "";
        })()
      : "",
    "",
    cta?.title ? `CTA: ${asString(cta.title)}` : "",
    asString(cta?.body),
  ];

  return sections.filter((line) => line !== "").join("\n");
}
