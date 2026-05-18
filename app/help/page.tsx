import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import HelpCenterWidget from "@/components/os/widgets/HelpCenterWidget";
import { COOKIE_LOCALE, isRtlLocale, normalizeLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

const BACK_LABEL: Record<string, string> = {
  he: "← חזרה למרחב העבודה",
  en: "← Back to workspace",
  ru: "← Назад к рабочему столу",
};

export default async function HelpPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/help");
  }

  const locale = normalizeLocale((await cookies()).get(COOKIE_LOCALE)?.value);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <div className="min-h-screen bg-[color:var(--background-main)]" dir={dir}>
      <div className="mx-auto max-w-5xl p-4">
        <Link href="/" className="mb-4 inline-block text-sm font-bold text-blue-600 hover:underline">
          {BACK_LABEL[locale] ?? BACK_LABEL.he}
        </Link>
        <div className="h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-[color:var(--border-main)] shadow-lg">
          <HelpCenterWidget />
        </div>
      </div>
    </div>
  );
}
