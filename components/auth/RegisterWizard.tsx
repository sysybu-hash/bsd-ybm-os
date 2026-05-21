"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTenant } from "@/components/tenant/TenantContext";
import PasswordFields from "@/components/auth/PasswordFields";
import { passwordMeetsRules } from "@/lib/auth/client-password";
import type { CustomerType } from "@prisma/client";

type OrgTypeKey = "home" | "freelancer" | "company" | "enterprise";

const TYPE_TO_CUSTOMER: Record<OrgTypeKey, CustomerType> = {
  home: "HOME",
  freelancer: "FREELANCER",
  company: "COMPANY",
  enterprise: "ENTERPRISE",
};

type Props = {
  embedded?: boolean;
  onSwitchToLogin?: () => void;
};

export default function RegisterWizard({ embedded = false, onSwitchToLogin }: Props) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const tenant = useTenant();

  const initialEmail = params.get("email")?.trim() ?? "";
  const inviteToken = params.get("invite")?.trim() ?? "";
  const orgInviteToken = params.get("orgInvite")?.trim() ?? "";

  const [step, setStep] = useState(0);
  const [orgType, setOrgType] = useState<OrgTypeKey>("company");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [orgName, setOrgName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [industry, setIndustry] = useState<"CONSTRUCTION" | "COMPANY_MGMT">("COMPANY_MGMT");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  const steps = useMemo(
    () => [
      t("auth.register.steps.type"),
      t("auth.register.steps.personal"),
      t("auth.register.steps.orgName"),
      t("auth.register.steps.password"),
      t("auth.register.steps.confirm"),
    ],
    [t],
  );

  const orgNameLabel =
    orgType === "home"
      ? t("auth.register.labels.orgNameHome")
      : orgType === "freelancer"
        ? t("auth.register.labels.orgNameFreelancer")
        : t("auth.register.labels.orgNameCompany");

  const orgNamePlaceholder =
    orgType === "home"
      ? t("auth.register.placeholders.orgNameHome")
      : orgType === "freelancer"
        ? t("auth.register.placeholders.orgNameFreelancer")
        : t("auth.register.placeholders.orgNameCompany");

  const goLogin = (withEmail?: boolean) => {
    if (onSwitchToLogin) {
      onSwitchToLogin();
      return;
    }
    const q = withEmail && email ? `?email=${encodeURIComponent(email)}` : "";
    router.push(`/login${q}`);
  };

  const submit = async () => {
    if (!email.includes("@")) {
      toast.error(t("auth.register.labels.email"));
      return;
    }
    if (orgName.trim().length < 2) {
      toast.error(orgNameLabel);
      return;
    }
    if (!passwordMeetsRules(password) || password !== passwordConfirm) {
      toast.error(t("auth.hub.register.passwordInvalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          organizationName: orgName.trim(),
          orgType: TYPE_TO_CUSTOMER[orgType],
          industry,
          constructionTrade: industry === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR",
          inviteToken: inviteToken || undefined,
          orgInviteToken: orgInviteToken || undefined,
          password,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? data.message ?? "הרשמה נכשלה");
        return;
      }
      const msg = data.message ?? "";
      setPendingApproval(msg.includes("מנהל") || msg.includes("אישור"));
      setDone(true);
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  };

  const successBlock = (
    <div className="rounded-xl border border-emerald-500/30 bg-[color:var(--surface-soft)] p-6 text-center">
      <CheckCircle2 className="mx-auto mb-4 text-emerald-500" size={48} aria-hidden />
      <h3 className="text-lg font-black">
        {pendingApproval ? t("auth.hub.register.pendingTitle") : t("auth.register.success.title")}
      </h3>
      <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">
        {pendingApproval ? t("auth.hub.register.pendingDesc") : t("auth.hub.register.successDesc")}
      </p>
      <button
        type="button"
        onClick={() => goLogin(true)}
        className="mt-6 w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-black text-white"
      >
        {t("auth.register.success.cta")}
      </button>
    </div>
  );

  if (done) {
    if (embedded) return successBlock;
    return (
      <main
        className="flex min-h-dvh items-center justify-center bg-[color:var(--background-main)] px-5 py-10"
        dir={dir}
      >
        <div className="max-w-md w-full">{successBlock}</div>
      </main>
    );
  }

  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const wizardBody = (
    <>
      {!embedded ? (
        <div className="mb-6 flex items-center justify-between gap-3">
          <BrandHomeLink size="sm" />
          <LocaleSwitcher compact />
        </div>
      ) : null}

      {tenant && !embedded ? (
        <p className="mb-4 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-2 text-center text-sm font-bold">
          {t("auth.register.summary.joining")}
          {tenant.organizationName}
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

      <div
        className={`mt-4 flex-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-5 ${embedded ? "" : "shadow-sm"}`}
      >
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold text-[color:var(--foreground-muted)]">
                {t("auth.register.industrySection")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["COMPANY_MGMT", "CONSTRUCTION"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIndustry(key)}
                    className={`rounded-xl border p-3 text-start text-sm transition ${
                      industry === key
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
                        : "border-[color:var(--border-main)]"
                    }`}
                  >
                    {key === "COMPANY_MGMT"
                      ? t("auth.register.industryCompany")
                      : t("auth.register.industryConstruction")}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["home", "freelancer", "company", "enterprise"] as OrgTypeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrgType(key)}
                  className={`rounded-xl border p-4 text-start transition ${
                    orgType === key
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
                      : "border-[color:var(--border-main)] hover:bg-[color:var(--surface-card)]"
                  }`}
                >
                  <p className="font-black">{t(`auth.register.types.${key}.label`)}</p>
                  <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                    {t(`auth.register.types.${key}.desc`)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label className="block text-sm font-bold">
              {t("auth.register.labels.fullName")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-3 text-sm"
                placeholder={t("auth.register.placeholders.fullName")}
              />
            </label>
            <label className="block text-sm font-bold">
              {t("auth.register.labels.email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-3 text-sm"
                readOnly={Boolean(initialEmail)}
                autoComplete="email"
              />
            </label>
            <p className="text-xs text-[color:var(--foreground-muted)]">{t("auth.hub.register.emailHint")}</p>
          </div>
        )}

        {step === 2 && (
          <label className="block text-sm font-bold">
            {orgNameLabel}
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-3 text-sm"
              placeholder={orgNamePlaceholder}
            />
          </label>
        )}

        {step === 3 && (
          <PasswordFields
            password={password}
            confirm={passwordConfirm}
            onPasswordChange={setPassword}
            onConfirmChange={setPasswordConfirm}
            labels={{
              password: t("auth.hub.register.passwordLabel"),
              confirm: t("auth.hub.register.passwordConfirm"),
              generate: t("auth.hub.register.generatePassword"),
              copy: t("auth.hub.register.copyPassword"),
              requirements: t("auth.hub.register.passwordRequirements"),
            }}
          />
        )}

        {step === 4 && (
          <ul className="space-y-3 text-sm">
            <li>
              <span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.type")}: </span>
              <strong>{t(`auth.register.types.${orgType}.label`)}</strong>
            </li>
            <li>
              <span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.name")}: </span>
              <strong>{name || "—"}</strong>
            </li>
            <li>
              <span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.email")}: </span>
              <strong>{email}</strong>
            </li>
            <li>
              <span className="text-[color:var(--foreground-muted)]">{t("auth.register.summary.orgName")}: </span>
              <strong>{orgName}</strong>
            </li>
          </ul>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border-main)] px-4 py-2.5 text-sm font-bold"
          >
            <BackIcon size={16} aria-hidden />
            {t("auth.register.back")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goLogin()}
            className="text-sm font-bold text-[color:var(--foreground-muted)]"
          >
            {t("auth.register.backToLogin")}
          </button>
        )}
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 3 && (!passwordMeetsRules(password) || password !== passwordConfirm)) {
                toast.error(t("auth.hub.register.passwordInvalid"));
                return;
              }
              setStep((s) => s + 1);
            }}
            className="ms-auto inline-flex items-center gap-2 rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-black text-white"
          >
            {t("auth.register.next")}
            <NextIcon size={16} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="ms-auto rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
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

  if (embedded) {
    return <div className="flex flex-col">{wizardBody}</div>;
  }

  return (
    <main
      className="flex min-h-dvh flex-col bg-[color:var(--background-main)] px-4 py-8 text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">{wizardBody}</div>
    </main>
  );
}
