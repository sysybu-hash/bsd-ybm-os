"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTenant } from "@/components/tenant/TenantContext";
import { passwordMeetsRules } from "@/lib/auth/client-password";
import type { CustomerType } from "@prisma/client";

export type OrgTypeKey = "home" | "freelancer" | "company" | "enterprise";

export const TYPE_TO_CUSTOMER: Record<OrgTypeKey, CustomerType> = {
  home: "HOME",
  freelancer: "FREELANCER",
  company: "COMPANY",
  enterprise: "ENTERPRISE",
};

type Props = { onSwitchToLogin?: () => void };

export function useRegisterWizard({ onSwitchToLogin }: Props = {}) {
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
    if (onSwitchToLogin) { onSwitchToLogin(); return; }
    const q = withEmail && email ? `?email=${encodeURIComponent(email)}` : "";
    router.push(`/login${q}`);
  };

  const goNext = () => {
    if (step === 3 && (!passwordMeetsRules(password) || password !== passwordConfirm)) {
      toast.error(t("auth.hub.register.passwordInvalid"));
      return;
    }
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (!email.includes("@")) { toast.error(t("auth.register.labels.email")); return; }
    if (orgName.trim().length < 2) { toast.error(orgNameLabel); return; }
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
      if (!res.ok) { toast.error(data.error ?? data.message ?? "הרשמה נכשלה"); return; }
      const msg = data.message ?? "";
      setPendingApproval(msg.includes("מנהל") || msg.includes("אישור"));
      setDone(true);
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  };

  return {
    t, dir, tenant,
    step, setStep, steps,
    orgType, setOrgType, orgNameLabel, orgNamePlaceholder,
    name, setName, email, setEmail, initialEmail,
    orgName, setOrgName,
    password, setPassword, passwordConfirm, setPasswordConfirm,
    industry, setIndustry,
    busy, done, pendingApproval,
    goLogin, goNext, submit,
  };
}
