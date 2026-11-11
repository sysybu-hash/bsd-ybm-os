import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { vmbT } from "@/lib/vmb/i18n";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbWordmark } from "@/components/vmb/VmbWordmark";
import { SheetRenderSlider } from "@/components/vmb/landing/SheetRenderSlider";
import { LoginForm } from "@/components/vmb/auth/LoginForm";
import { googleConfigured } from "@/lib/vmb/google-oauth";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";

export const dynamic = "force-dynamic";

const t = vmbT("he");

export const metadata: Metadata = { title: t("vmb.nav.login"), robots: { index: false } };

/** Gate: the form on black, the sheet/render picture filling the other half. */
export default async function VmbLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getVmbPageUser()) redirect(await vmbServerPath("/app"));
  const raw = (await searchParams).error;
  const error = typeof raw === "string" ? raw.slice(0, 40) : undefined;
  return (
    <div className="vmb grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" data-theme="dark" dir="rtl" lang="he">
      <div className="flex flex-col px-6 py-7 sm:px-14">
        <VmbLink href="/" className="self-start">
          <VmbWordmark byline={t("vmb.brand.byline")} />
        </VmbLink>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
          <h1 className="vmb-display text-5xl leading-[1.02] font-extrabold">{t("vmb.login.title")}</h1>
          <p className="mt-4 text-lg font-light text-[color:var(--vmb-ink-soft)]">{t("vmb.login.lead")}</p>
          <LoginForm
            googleEnabled={googleConfigured()}
            initialError={error}
            labels={{
              google: t("vmb.login.google"),
              googleOff: t("vmb.login.soon"),
              or: t("vmb.login.or"),
              tabLogin: t("vmb.login.tabLogin"),
              tabRegister: t("vmb.login.tabRegister"),
              name: t("vmb.login.name"),
              email: t("vmb.login.email"),
              password: t("vmb.login.password"),
              passwordHint: t("vmb.login.passwordHint"),
              submit: t("vmb.login.submit"),
              submitRegister: t("vmb.login.submitRegister"),
              busy: t("vmb.login.busy"),
              errors: {
                invalid: t("vmb.login.errInvalid"),
                exists: t("vmb.login.errExists"),
                weak: t("vmb.login.errWeak"),
                rate: t("vmb.login.errRate"),
                server: t("vmb.login.errServer"),
                server_error: t("vmb.login.errServer"),
                forbidden: t("vmb.login.errServer"),
                google_cancelled: t("vmb.login.errGoogle"),
                google_state: t("vmb.login.errGoogle"),
                google_failed: t("vmb.login.errGoogle"),
              },
            }}
          />
          <p className="mt-8 text-sm text-[color:var(--vmb-ink-soft)]">{t("vmb.login.newHere")}</p>
          <p className="mt-2 text-xs text-[color:var(--vmb-muted)]">{t("vmb.login.terms")}</p>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden lg:block">
        <SheetRenderSlider
          src="/floorplan-viz/styles/jerusalem_stone.jpg"
          alt={t("vmb.hero.stageRender")}
          sheetLabel={t("vmb.hero.stageSheet")}
          renderLabel={t("vmb.hero.stageRender")}
          chips={[{ top: "18%", left: "14%", text: "3.60 m" }]}
          start={52}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
        <div className="vmb-glass pointer-events-none absolute inset-x-10 bottom-10 rounded-2xl p-6">
          <p className="text-xs text-[color:var(--vmb-muted)]">{t("vmb.accuracy.certTitle")}</p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="vmb-mono text-4xl font-semibold text-[color:var(--vmb-measure)]">0.03 m</span>
            <span className="text-sm text-[color:var(--vmb-ink-soft)]">{t("vmb.hero.chipMedian")}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
