import Link from "next/link";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import { getLegalDocument, type LegalDocKind } from "@/lib/google-publish/legal-templates";
import type { AppLocale } from "@/lib/i18n/config";

type PublicLegalLayoutProps = {
  kind: LegalDocKind;
  locale: AppLocale;
};

const NAV: { kind: LegalDocKind; path: string; label: Record<AppLocale, string> }[] = [
  { kind: "privacy", path: "/privacy", label: { he: "פרטיות", en: "Privacy", ru: "Конфиденциальность" } },
  { kind: "terms", path: "/terms", label: { he: "תנאים", en: "Terms", ru: "Условия" } },
  { kind: "legal", path: "/legal", label: { he: "משפטי", en: "Legal", ru: "Правовая" } },
];

const ABOUT_LABEL: Record<AppLocale, string> = { he: "אודות", en: "About", ru: "О нас" };

export default function PublicLegalLayout({ kind, locale }: PublicLegalLayoutProps) {
  const doc = getLegalDocument(kind, locale);
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <div className="min-h-dvh bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 border-b border-[color:var(--border-main)] px-4 py-4">
{/* Header lockup — above the fold by definition, so never lazy. On pages
            whose largest painted element is this logo it was the LCP and lazy
            loading pushed LCP past 4s. */}
        <BrandHomeLink size="sm" loading="eager" />
        <LocaleSwitcher compact />
      </header>
      <nav className="mx-auto flex max-w-3xl gap-2 px-4 py-3 text-sm font-bold">
        {NAV.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`rounded-lg px-3 py-1.5 ${item.kind === kind ? "bg-indigo-600 text-white" : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"}`}
          >
            {item.label[locale]}
          </Link>
        ))}
        <Link href="/about" className="rounded-lg px-3 py-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]">
          {ABOUT_LABEL[locale]}
        </Link>
      </nav>
      <article className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-black">{doc.title}</h1>
        <p className="mb-8 text-sm leading-relaxed text-[color:var(--foreground-muted)]">{doc.intro}</p>
        <div className="space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-2 text-lg font-black">{section.heading}</h2>
              <p className="text-sm leading-relaxed text-[color:var(--foreground-muted)]">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
