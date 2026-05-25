"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTenant } from "@/components/tenant/TenantContext";
import LoginPanel from "@/components/auth/LoginPanel";
import RegisterWizard from "@/components/auth/RegisterWizard";
import { toast } from "sonner";

type Tab = "login" | "register";

export default function AuthExperience() {
  const { t, dir } = useI18n();
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const tenant = useTenant();

  const initialTab = useMemo<Tab>(() => {
    if (params.get("mode") === "register") return "register";
    return "login";
  }, [params]);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  const prefilledEmail = params.get("email")?.trim() ?? "";

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  const setTabAndUrl = useCallback(
    (next: Tab) => {
      setTab(next);
      const q = new URLSearchParams(params.toString());
      if (next === "register") q.set("mode", "register");
      else q.delete("mode");
      const s = q.toString();
      router.replace(s ? `/login?${s}` : "/login", { scroll: false });
    },
    [params, router],
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

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[color:var(--background-main)]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" aria-hidden />
      </div>
    );
  }

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[color:var(--background-main)] px-4 py-10 text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 start-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-blue-500/12 blur-[100px]" />
        <div className="absolute bottom-0 end-0 h-[320px] w-[360px] rounded-full bg-emerald-500/10 blur-[90px]" />
      </div>

      <div className="absolute end-5 top-5 z-10">
        <LocaleSwitcher compact />
      </div>
      <div className="absolute start-5 top-5 z-10">
        <BrandHomeLink size="sm" priority />
      </div>

      <section className="landing-reveal relative z-[1] grid w-full max-w-5xl overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 shadow-2xl backdrop-blur-md md:grid-cols-[0.92fr_1.08fr]">
        <div className="border-b border-[color:var(--border-main)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-8 text-white md:border-b-0 md:border-s">
          <BrandHomeLink
            size="xl"
            className="mb-8 items-start pointer-events-none"
            priority
          />
          {tenant?.branding.landingTitle ? (
            <p className="mb-3 text-lg font-black">{tenant.branding.landingTitle}</p>
          ) : null}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200">
            <ShieldCheck size={14} aria-hidden />
            {t("auth.loginOs.secureBadge")}
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t("auth.hub.heroTitle")}</h1>
          <p className="mt-4 text-sm font-medium leading-7 text-slate-300">{t("auth.hub.heroBody")}</p>
          <ul className="mt-8 space-y-3 text-sm font-semibold text-slate-300">
            {[t("auth.hub.bullet1"), t("auth.hub.bullet2"), t("auth.hub.bullet3")].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col p-6 md:p-9">
          <div
            className="mb-6 flex rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-1"
            role="tablist"
          >
            {(["login", "register"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTabAndUrl(key)}
                className={`flex-1 rounded-lg py-2.5 text-sm font-black transition ${
                  tab === key
                    ? "bg-[color:var(--accent)] text-white shadow-sm"
                    : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                }`}
              >
                {key === "login" ? t("auth.hub.tabs.login") : t("auth.hub.tabs.register")}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            forgotOpen ? (
              <div className="space-y-4">
                <h2 className="text-xl font-black">{t("auth.hub.forgot.title")}</h2>
                <p className="text-sm text-[color:var(--foreground-muted)]">{t("auth.hub.forgot.body")}</p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-3 text-sm"
                  placeholder={t("auth.login.emailPlaceholder")}
                />
                <button
                  type="button"
                  disabled={forgotBusy}
                  onClick={() => void submitForgot()}
                  className="w-full rounded-lg bg-[color:var(--accent)] py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {forgotBusy ? "…" : t("auth.hub.forgot.submit")}
                </button>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="text-sm font-bold text-[color:var(--foreground-muted)]"
                >
                  {t("auth.register.back")}
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 text-xl font-black">{t("auth.hub.loginTitle")}</h2>
                <p className="mb-5 text-sm text-[color:var(--foreground-muted)]">{t("auth.hub.loginSubtitle")}</p>
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
            <>
              <h2 className="mb-1 text-xl font-black">{t("auth.register.title")}</h2>
              <p className="mb-4 text-sm text-[color:var(--foreground-muted)]">{t("auth.hub.registerSubtitle")}</p>
              <RegisterWizard embedded onSwitchToLogin={() => setTabAndUrl("login")} />
            </>
          )}

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-8 inline-flex items-center justify-center gap-2 text-sm font-bold text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)]"
          >
            {t("auth.loginOs.backHome")}
            <ArrowLeft size={16} aria-hidden />
          </button>
        </div>
      </section>
    </main>
  );
}
