import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_LOCALE, normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { legalSite } from "@/lib/legal-site";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";
import PublicPageShell from "@/components/landing/marketing/PublicPageShell";

export const metadata: Metadata = buildPublicPageMetadata("about");

const COPY: Record<
  AppLocale,
  { title: string; lead: string; features: string[]; cta: string }
> = {  he: {
    title: "אודות BSD-YBM OS",
    lead: `${legalSite.siteName} — מערכת תפעול לעסקים ויזמים: לקוחות, מסמכים, סריקת AI, חיוב, AI Hub ומחולל אפליקציות במקום אחד.`,
    features: [
      "ניהול לקוחות ופרויקטים (CRM)",
      "ארכיון ERP ומסמכים",
      "סורק רב־מנועי עם Gemini, OpenAI ו-Document AI",
      "AI Hub — צ'אט, מחברת ומחולל אפליקציות (Composer)",
      "מנוע רעיונות — פקודות טבעיות ל-CRM, חשבוניות וסריקה",
      "עוזר AI קולי (Gemini Live) וטקסטואלי",
      "תמיכה בעברית, אנגלית ורוסית",
    ],
    cta: "התחברות למערכת",
  },
  en: {
    title: "About BSD-YBM OS",
    lead: `${legalSite.siteName} — operations workspace for businesses and entrepreneurs: CRM, documents, AI scanning, billing, AI Hub and app builder.`,
    features: [
      "CRM & project boards",
      "ERP archive",
      "Multi-engine AI scanner",
      "AI Hub — chat, notebook and app builder (Composer)",
      "Idea engine — natural-language CRM, invoices and scan commands",
      "Voice (Gemini Live) and text AI assistant",
      "Hebrew, English and Russian UI",
    ],
    cta: "Sign in",
  },
  ru: {
    title: "О BSD-YBM OS",
    lead: `${legalSite.siteName} — рабочая среда для бизнеса: CRM, документы, AI-сканирование, AI Hub и конструктор приложений.`,
    features: [
      "CRM и проекты",
      "Архив ERP",
      "AI-сканер документов",
      "AI Hub — чат, блокнот и конструктор (Composer)",
      "Движок идей — команды CRM, счетов и сканирования",
      "Голосовой (Gemini Live) и текстовый ассистент",
      "Интерфейс на иврите, английском и русском",
    ],
    cta: "Войти",
  },
};

export default async function AboutPage() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const c = COPY[locale];
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <PublicPageShell heroTitle={c.title} heroSubtitle={c.lead}>
      <div className="mx-auto max-w-3xl px-4 py-10" dir={dir}>
        <ul className="mb-10 list-inside list-disc space-y-2 text-[color:var(--foreground-muted)]">
          {c.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <Link
          href="/login"
          className="inline-flex rounded-xl bg-[color:var(--brand-accent,#4f46e5)] px-6 py-3 text-sm font-black text-white shadow-md transition hover:opacity-90"
        >
          {c.cta}
        </Link>
      </div>
    </PublicPageShell>
  );
}
