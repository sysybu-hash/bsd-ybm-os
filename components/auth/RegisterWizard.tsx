"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Mail } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import OsBootSplash from "@/components/os/boot/OsBootSplash";
import { SITE_CONTACT } from "@/lib/site-contact";
import { AUTH_BTN_PRIMARY, AUTH_BTN_SECONDARY } from "@/components/auth/auth-ui";
import RegisterWizardStep from "@/components/auth/register-wizard/RegisterWizardStep";
import { useRegisterWizard } from "./register-wizard/useRegisterWizard";

type Props = {
  embedded?: boolean;
  onSwitchToLogin?: () => void;
  /** Effective monthly price per tier, resolved server-side. */
  tierPrices?: Record<string, number>;
};

export default function RegisterWizard({ embedded = false, onSwitchToLogin, tierPrices }: Props) {
  const s = useRegisterWizard({ onSwitchToLogin, tierPrices });
  const {
    t, dir, tenant,
    step, setStep, steps,
    isPaidTier, paypalOrderId,
    busy, done, pendingApproval, enteringWorkspace,
    goLogin, goNext, submit,
  } = s;

  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  if (enteringWorkspace) {
    return <OsBootSplash phase="register" />;
  }

  const successBlock = pendingApproval ? (
    <div className="rounded-xl border border-amber-500/30 bg-[color:var(--surface-soft)] p-6 text-center">
      <Clock3 className="mx-auto mb-4 text-amber-500" size={48} aria-hidden />
      <h3 className="text-lg font-black">{t("auth.hub.register.pendingTitle")}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--foreground-muted)]">
        {t("auth.hub.register.pendingDesc")}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-[color:var(--foreground-muted)]">
        {t("auth.hub.register.pendingNext")}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <button type="button" onClick={() => goLogin(true)} className={AUTH_BTN_PRIMARY}>
          {t("auth.hub.register.pendingLoginCta")}
        </button>
        <a
          href={`mailto:${SITE_CONTACT.email}?subject=${encodeURIComponent(t("auth.hub.register.pendingMailSubject"))}`}
          className={`${AUTH_BTN_SECONDARY} inline-flex items-center justify-center gap-2`}
        >
          <Mail size={16} aria-hidden />
          {t("auth.hub.register.pendingContactCta")}
        </a>
        <Link href="/" className="mt-1 text-xs font-bold text-[color:var(--accent-text)] hover:underline">
          {t("auth.hub.register.pendingHomeCta")}
        </Link>
      </div>
    </div>
  ) : (
    <div className="rounded-xl border border-emerald-500/30 bg-[color:var(--surface-soft)] p-6 text-center">
      <CheckCircle2 className="mx-auto mb-4 text-emerald-500" size={48} aria-hidden />
      <h3 className="text-lg font-black">{t("auth.register.success.title")}</h3>
      <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">
        {t("auth.hub.register.successDesc")}
      </p>
      <button type="button" onClick={() => goLogin(true)} className={`mt-6 ${AUTH_BTN_PRIMARY}`}>
        {t("auth.register.success.cta")}
      </button>
    </div>
  );

  if (done) {
    if (embedded) return successBlock;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background-main)] px-5 py-10" dir={dir}>
        <div className="max-w-md w-full">{successBlock}</div>
      </main>
    );
  }

  const wizardBody = (
    <>
      {!embedded ? (
        <div className="mb-6 flex items-center justify-between gap-3">
          <BrandHomeLink size="sm" variant="image" tone="auto" />
          <LocaleSwitcher compact />
        </div>
      ) : null}

      {tenant && !embedded ? (
        <p className="mb-4 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-2 text-center text-sm font-bold">
          {t("auth.register.summary.joining")}{tenant.organizationName}
        </p>
      ) : null}

      {!embedded ? (
        <>
          <h1 className="text-2xl font-black">{t("auth.register.title")}</h1>
          <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{t("auth.register.subtitle")}</p>
        </>
      ) : null}

      <p className="mt-3 text-xs font-bold text-[color:var(--foreground-muted)]">
        {t("auth.register.steps.step")} {step + 1} {t("auth.register.steps.of")} {steps.length}: {steps[step]}
      </p>

      <div className={`mt-4 flex-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-5 ${embedded ? "" : "shadow-sm"}`}>
        <RegisterWizardStep s={s} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2.5 text-sm font-bold transition hover:bg-[color:var(--surface-soft)]">
            <BackIcon size={16} aria-hidden />
            {t("auth.register.back")}
          </button>
        ) : (
          <button type="button" onClick={() => goLogin()}
            className="text-sm font-bold text-[color:var(--foreground-muted)]">
            {t("auth.register.backToLogin")}
          </button>
        )}
        {step < steps.length - 1 ? (
          <button type="button" onClick={goNext}
            className="ms-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500">
            {t("auth.register.next")}
            <NextIcon size={16} aria-hidden />
          </button>
        ) : isPaidTier && !paypalOrderId ? (
          // Payment happens in the PayPal buttons above; submitting before the
          // payer approves would only be rejected server-side.
          null
        ) : (
          <button type="button" disabled={busy} onClick={() => void submit()}
            className="ms-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60">
            {busy ? "…" : isPaidTier ? t("auth.register.submitPaid") : t("auth.register.submit")}
          </button>
        )}
      </div>

      {!embedded ? (
        <p className="mt-4 text-center text-sm text-[color:var(--foreground-muted)]">
          {t("auth.register.alreadyHave")}{" "}
          <button type="button" onClick={() => goLogin()} className="font-bold text-[color:var(--accent-text)]">
            {t("auth.register.loginLink")}
          </button>
        </p>
      ) : null}
    </>
  );

  if (embedded) return <div className="flex flex-col">{wizardBody}</div>;

  return (
    <main className="flex min-h-dvh flex-col bg-[color:var(--background-main)] px-4 py-8 text-[color:var(--foreground-main)]" dir={dir}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">{wizardBody}</div>
    </main>
  );
}
