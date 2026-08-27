"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import PasswordFields from "@/components/auth/PasswordFields";
import {
  AUTH_INPUT,
  AUTH_OPTION_CARD,
  AUTH_OPTION_CARD_ACTIVE,
  AUTH_OPTION_CARD_IDLE,
} from "@/components/auth/auth-ui";
import PayPalRegisterButtons from "@/components/auth/register-wizard/PayPalRegisterButtons";
import type { OrgTypeKey, useRegisterWizard } from "./useRegisterWizard";

type WizardState = ReturnType<typeof useRegisterWizard>;

/**
 * The body of whichever wizard step is current.
 *
 * RegisterWizard keeps the frame — header, progress line, back/next buttons,
 * and the success and pending-approval screens. Those are the parts that behave
 * the same on every step. What changes from step to step lives here.
 *
 * The whole hook result is passed through rather than twenty-odd individual
 * props: every field below already comes from `useRegisterWizard`, and listing
 * them again would be a second copy of its signature to keep in sync.
 */
export default function RegisterWizardStep({ s }: { s: WizardState }) {
  const {
    t, step,
    orgType, setOrgType,
    orgNameLabel, orgNamePlaceholder,
    name, setName, email, setEmail, initialEmail,
    orgName, setOrgName,
    password, setPassword, passwordConfirm, setPasswordConfirm,
    tier, setTier, billingCycle, setBillingCycle,
    tierOptions, isPaidTier, paypalOrderId, setPaypalOrderId,
    industry, setIndustry,
    specialization, setSpecialization, specializationOptions,
  } = s;

  return (
    <>
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
              readOnly={Boolean(initialEmail)} autoComplete="email"
              placeholder={t("auth.login.emailPlaceholder")} />
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

      {/* Step 4: Plan */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-[color:var(--foreground-muted)]">
              {t("auth.register.planSection")}
            </p>
            <div className="flex rounded-lg border border-[color:var(--border-main)] p-0.5 text-xs font-bold">
              {(["monthly", "annual"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setBillingCycle(c)}
                  className={`rounded-md px-2.5 py-1 transition ${billingCycle === c ? "bg-indigo-600 text-white" : "text-[color:var(--foreground-muted)]"}`}>
                  {c === "monthly" ? t("auth.register.cycleMonthly") : t("auth.register.cycleAnnual")}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            {tierOptions.map((opt) => {
              const price = billingCycle === "annual" ? opt.annualPriceIls : opt.monthlyPriceIls;
              return (
                <button key={opt.key} type="button" onClick={() => setTier(opt.key)}
                  className={`rounded-xl border p-3 text-start transition ${tier === opt.key ? AUTH_OPTION_CARD_ACTIVE : AUTH_OPTION_CARD_IDLE}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-black">{opt.label}</span>
                    <span className="text-sm font-bold">
                      {price > 0
                        ? `₪${price} ${billingCycle === "annual" ? t("auth.register.perYear") : t("auth.register.perMonth")}`
                        : t("auth.register.freePrice")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                    {opt.cheapScans} / {opt.premiumScans} {t("auth.register.scansSuffix")}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[color:var(--foreground-muted)]">{t("auth.register.planHint")}</p>
        </div>
      )}

      {/* Step 5: Password */}
      {step === 5 && (
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

      {/* Step 6: Confirmation summary */}
      {step === 6 && (
        <ul className="space-y-3 text-sm">
          <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.type")}: </span><strong>{t(`auth.register.types.${orgType}.label`)}</strong></li>
          <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.specialization")}: </span><strong>{specializationOptions.find((o) => o.id === specialization)?.label ?? specialization}</strong></li>
          <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.name")}: </span><strong>{name || "—"}</strong></li>
          <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.email")}: </span><strong>{email}</strong></li>
          <li><span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.orgName")}: </span><strong>{orgName}</strong></li>
          <li>
            <span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.plan")}: </span>
            <strong>{tierOptions.find((o) => o.key === tier)?.label ?? tier}</strong>
          </li>

          {isPaidTier ? (
            <li className="!mt-5 border-t border-[color:var(--border-main)] pt-4">
              {paypalOrderId ? (
                <p className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={18} aria-hidden />
                  {t("auth.register.paymentApproved")}
                </p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">
                    {t("auth.register.payToFinish")}
                  </p>
                  <PayPalRegisterButtons
                    email={email.trim().toLowerCase()}
                    tier={tier}
                    billingCycle={billingCycle}
                    onApproved={setPaypalOrderId}
                    onError={(m) => toast.error(m)}
                    labels={{
                      unavailable: t("auth.register.paymentUnavailable"),
                      loading: t("auth.register.paymentLoading"),
                      failed: t("auth.register.paymentFailed"),
                    }}
                  />
                </>
              )}
            </li>
          ) : null}
        </ul>
      )}
    </>
  );
}
