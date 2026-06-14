"use client";

import React from "react";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import PasswordFields from "@/components/auth/PasswordFields";
import { passwordMeetsRules } from "@/lib/auth/client-password";
import {
  AUTH_INPUT,
  AUTH_BTN_PRIMARY,
  AUTH_OPTION_CARD,
  AUTH_OPTION_CARD_ACTIVE,
  AUTH_OPTION_CARD_IDLE,
} from "@/components/auth/auth-ui";
import { useRegisterWizard, type OrgTypeKey } from "./register-wizard/useRegisterWizard";

type Props = {
  embedded?: boolean;
  onSwitchToLogin?: () => void;
};

export default function RegisterWizard({ embedded = false, onSwitchToLogin }: Props) {
  const s = useRegisterWizard({ onSwitchToLogin });
  const {
    t, dir, tenant,
    step, setStep, steps,
    orgType, setOrgType, orgNameLabel, orgNamePlaceholder,
    name, setName, email, setEmail, initialEmail,
    orgName, setOrgName,
    password, setPassword, passwordConfirm, setPasswordConfirm,
    industry, setIndustry,
    specialization, setSpecialization, specializationOptions,
    busy, done, pendingApproval,
    goLogin, goNext, submit,
  } = s;

  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const successBlock = (
    <div className="rounded-xl border border-emerald-500/30 bg-[color:var(--surface-soft)] p-6 text-center">
      <CheckCircle2 className="mx-auto mb-4 text-emerald-500" size={48} aria-hidden />
      <h3 className="text-lg font-black">
        {pendingApproval ? t("auth.hub.register.pendingTitle") : t("auth.register.success.title")}
      </h3>
      <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">
        {pendingApproval ? t("auth.hub.register.pendingDesc") : t("auth.hub.register.successDesc")}
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
        {/* Step 0: Industry + org type */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold text-[color:var(--foreground-muted)]">
                {t("auth.register.industrySection")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["COMPANY_MGMT", "CONSTRUCTION"] as const).map((key) => (
                  <button key={key} type="button" onClick={() => setIndustry(key)}
                    className={`${AUTH_OPTION_CARD} ${industry === key ? AUTH_OPTION_CARD_ACTIVE : AUTH_OPTION_CARD_IDLE}`}>
                    {key === "COMPANY_MGMT" ? t("auth.register.industryCompany") : t("auth.register.industryConstruction")}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["home", "freelancer", "company", "enterprise"] as OrgTypeKey[]).map((key) => (
                <button key={key} type="button" onClick={() => setOrgType(key)}
                  className={`rounded-xl border p-4 text-start transition ${orgType === key ? AUTH_OPTION_CARD_ACTIVE : AUTH_OPTION_CARD_IDLE}`}>
                  <p className="font-black">{t(`auth.register.types.${key}.label`)}</p>
                  <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">{t(`auth.register.types.${key}.desc`)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Specialization */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[color:var(--foreground-muted)]">
              {industry === "CONSTRUCTION" ? t("auth.register.specializationConstruction") : t("auth.register.specializationBusiness")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {specializationOptions.map((opt) => (
                <button key={opt.id} type="button" onClick={() => setSpecialization(opt.id)}
                  className={`rounded-xl border p-3 text-start text-sm transition ${specialization === opt.id ? AUTH_OPTION_CARD_ACTIVE : AUTH_OPTION_CARD_IDLE}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Personal info */}
        {step === 2 && (
          <div className="space-y-4">
            <label className="block text-sm font-bold">
              {t("auth.register.labels.fullName")}
              <input value={name} onChange={(e) => setName(e.target.value)}
                className={`mt-1 ${AUTH_INPUT}`}
                placeholder={t("auth.register.placeholders.fullName")} />
            </label>
            <label className="block text-sm font-bold">
              {t("auth.register.labels.email")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={`mt-1 ${AUTH_INPUT}`}
                readOnly={Boolean(initialEmail)} autoComplete="email" />
            </label>
            <p className="text-xs text-[color:var(--foreground-muted)]">{t("auth.hub.register.emailHint")}</p>
          </div>
        )}

        {/* Step 3: Org name */}
        {step === 3 && (
          <label className="block text-sm font-bold">
            {orgNameLabel}
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)}
              className={`mt-1 ${AUTH_INPUT}`}
              placeholder={orgNamePlaceholder} />
          </label>
        )}

        {/* Step 4: Password */}
        {step === 4 && (
          <PasswordFields
            password={password} confirm={passwordConfirm}
            onPasswordChange={setPassword} onConfirmChange={setPasswordConfirm}
            labels={{
              password: t("auth.hub.register.passwordLabel"),
              confirm: t("auth.hub.register.passwordConfirm"),
              generate: t("auth.hub.register.generatePassword"),
              copy: t("auth.hub.register.copyPassword"),
              requirements: t("auth.hub.register.passwordRequirements"),
              generateSuccess: t("auth.hub.register.passwordGenerated"),
              passwordMismatch: t("auth.hub.register.passwordMismatch"),
            }}
          />
        )}

        {/* Step 5: Confirmation summary */}
        {step === 5 && (
          <ul className="space-y-3 text-sm">
            <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.type")}: </span><strong>{t(`auth.register.types.${orgType}.label`)}</strong></li>
            <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.specialization")}: </span><strong>{specializationOptions.find((o) => o.id === specialization)?.label ?? specialization}</strong></li>
            <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.name")}: </span><strong>{name || "—"}</strong></li>
            <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.email")}: </span><strong>{email}</strong></li>
            <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.orgName")}: </span><strong>{orgName}</strong></li>
          </ul>
        )}
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
        ) : (
          <button type="button" disabled={busy} onClick={() => void submit()}
            className="ms-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60">
            {busy ? "…" : t("auth.register.submit")}
          </button>
        )}
      </div>

      {!embedded ? (
        <p className="mt-4 text-center text-sm text-[color:var(--foreground-muted)]">
          {t("auth.register.alreadyHave")}{" "}
          <button type="button" onClick={() => goLogin()} className="font-bold text-[color:var(--accent)]">
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
