"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import { AUTH_INPUT, AUTH_BTN_PRIMARY } from "@/components/auth/auth-ui";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTenant } from "@/components/tenant/TenantContext";
import LoginPanel from "@/components/auth/LoginPanel";
import dynamic from "next/dynamic";
import { toast } from "sonner";

// Code-split the heavier registration wizard so /login ships only the login JS.
const RegisterWizard = dynamic(() => import("@/components/auth/RegisterWizard"), {
  loading: () => (
    <div className="h-64 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" aria-hidden />
  ),
});

type Tab = "login" | "register";

type AuthExperienceProps = Readonly<{
  /** Initial tab from the server-read `?mode=` param — keeps the page SSR-able. */
  initialMode?: Tab;
  /** Server-read `?email=` param to prefill the login form. */
  prefilledEmail?: string;
  /** Server-read `?plan=` param for funnel attribution. */
  plan?: string | null;
}>;

export default function AuthExperience({
  initialMode = "login",
  prefilledEmail = "",
  plan = null,
}: AuthExperienceProps) {
  const { t, dir } = useI18n();
  const { status } = useSession();
  const router = useRouter();
  const tenant = useTenant();

  const [tab, setTab] = useState<Tab>(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (tab !== "register") return;
    void import("@/lib/analytics/marketing-funnel").then(({ trackFunnelRegisterStarted }) => {
      trackFunnelRegisterStarted(plan ? "register_plan" : "login_tab");
    });
  }, [tab, plan]);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  const setTabAndUrl = useCallback(
    (next: Tab) => {
      setTab(next);
      // Preserve any other query params; read from the live URL (client-only callback).
      const q = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      if (next === "register") q.set("mode", "register");
      else q.delete("mode");
      const s = q.toString();
      router.replace(s ? `/login?${s}` : "/login", { scroll: false });
    },
    [router],
  );

  const submitForgot = async () => {
    if (!forgotEmail.includes("@")) {
      toast.error(t("auth.hub.forgot.invalidEmail"));
      return;
    }
    setForgotBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = (await res.json()) as { message?: string };
      toast.success(data.message ?? t("auth.hub.forgot.sent"));
      setForgotOpen(false);
    } catch {
      toast.error(t("auth.hub.forgot.error"));
    } finally {
      setForgotBusy(false);
    }
  };

  // Render the auth UI immediately — don't block the LCP on the session probe.
  // Authenticated visitors are redirected by the effect above (brief, rare flash).
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[color:var(--background-main)] px-3 py-4 text-[color:var(--foreground-main)] sm:px-4 sm:py-8"
      dir={dir}
    >
      {/* Ambient gradient wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 start-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-indigo-500/12 blur-[120px]" />
        <div className="absolute -bottom-24 end-[-6%] h-[380px] w-[440px] rounded-full bg-emerald-500/10 blur-[110px]" />
      </div>

      <div className="absolute end-3 top-3 z-10 sm:end-5 sm:top-5">
        <LocaleSwitcher compact />
      </div>

      <section className="relative z-[1] grid w-full max-w-md overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl md:max-w-5xl md:rounded-3xl md:shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)] md:grid-cols-[0.9fr_1.1fr]">
        {/* ── Brand / value panel (desktop only) ── */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-8 text-white md:flex md:p-10">
          <div aria-hidden className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -start-12 bottom-0 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="relative">
            <BrandHomeLink size="xl" variant="image" tone="night" priority />
            {tenant?.branding.landingTitle ? (
              <p className="mt-5 text-base font-black text-white/90">{tenant.branding.landingTitle}</p>
            ) : null}
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200 backdrop-blur-sm">
              <ShieldCheck size={14} aria-hidden />
              {t("auth.loginOs.secureBadge")}
            </div>
            <h1 className="mt-5 text-3xl font-black leading-[1.15] tracking-tight sm:text-4xl">
              {t("auth.hub.heroTitle")}
            </h1>
            <p className="mt-4 max-w-sm text-sm font-medium leading-7 text-slate-300">
              {t("auth.hub.heroBody")}
            </p>
          </div>
          <ul className="relative mt-9 space-y-3.5 text-sm font-semibold text-slate-200">
            {[t("auth.hub.bullet1"), t("auth.hub.bullet2"), t("auth.hub.bullet3")].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 size={14} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-col p-4 sm:p-6 md:p-10">
          <div className="mb-4 flex flex-col items-center gap-2 text-center md:hidden">
            <BrandHomeLink size="lg" variant="image" tone="auto" priority />
            <h1 className="text-lg font-black tracking-tight">{t("auth.hub.heroTitle")}</h1>
          </div>

          <div
            className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-1 md:mb-7 md:rounded-2xl"
            role="tablist"
          >
            {(["login", "register"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTabAndUrl(key)}
                className={`rounded-lg py-2 text-xs font-bold transition sm:rounded-xl sm:py-2.5 sm:text-sm ${
                  tab === key
                    ? "bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-sm"
                    : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                }`}
              >
                {key === "login" ? t("auth.hub.tabs.login") : t("auth.hub.tabs.register")}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            forgotOpen ? (
              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-lg font-black sm:text-xl">{t("auth.hub.forgot.title")}</h2>
                <p className="hidden text-sm text-[color:var(--foreground-muted)] sm:block">{t("auth.hub.forgot.body")}</p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className={AUTH_INPUT}
                  placeholder={t("auth.login.emailPlaceholder")}
                />
                <button
                  type="button"
                  disabled={forgotBusy}
                  onClick={() => void submitForgot()}
                  className={AUTH_BTN_PRIMARY}
                >
                  {forgotBusy ? "…" : t("auth.hub.forgot.submit")}
                </button>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="text-sm font-bold text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                >
                  {t("auth.register.back")}
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 hidden text-2xl font-black tracking-tight md:block">{t("auth.hub.loginTitle")}</h2>
                <p className="mb-6 hidden text-sm text-[color:var(--foreground-muted)] md:block">{t("auth.hub.loginSubtitle")}</p>
                <LoginPanel
                  t={t}
                  prefilledEmail={prefilledEmail}
                  onForgotPassword={() => {
                    setForgotEmail(prefilledEmail);
                    setForgotOpen(true);
                  }}
                />
              </>
            )
          ) : (
            <RegisterWizard embedded onSwitchToLogin={() => setTabAndUrl("login")} />
          )}

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-5 inline-flex items-center justify-center gap-2 text-xs font-bold text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)] sm:mt-8 sm:text-sm"
            aria-label={t("auth.loginOs.backHomeAria")}
          >
            <span>{t("auth.loginOs.backHome")}</span>
            <ArrowLeft size={16} aria-hidden className="rtl:rotate-180" />
          </button>
        </div>
      </section>
    </main>
  );
}
