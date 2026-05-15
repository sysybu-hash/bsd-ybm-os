import Link from "next/link";
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

export default function PublicLegalLayout({ kind, locale }: PublicLegalLayoutProps) {
  const doc = getLegalDocument(kind, locale);
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <div className="min-h-dvh bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 border-b border-[color:var(--border-main)] px-4 py-4">
        <Link href="/" className="text-sm font-black text-indigo-500">
          BSD-YBM OS
        </Link>
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
          {locale === "en" ? "About" : locale === "ru" ? "О нас" : "אודות"}
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
