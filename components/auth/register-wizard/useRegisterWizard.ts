"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTenant } from "@/components/tenant/TenantContext";
import { passwordMeetsRules } from "@/lib/auth/client-password";
import type { CustomerType } from "@prisma/client";
import { CONSTRUCTION_TRADE_IDS, constructionTradeLabelHe } from "@/lib/construction-trades";
import { BUSINESS_LINE_IDS, businessLineLabelHe } from "@/lib/business-lines";
import { PRELOGIN_TRADE_COOKIE } from "@/lib/prelogin-trade-cookie";
import { SESSION_MAX_AGE_DEFAULT_SEC } from "@/lib/auth/remember-preference";
import {
  parseSubscriptionTier,
  paypalPurchasableTiers,
  tierAllowance,
  tierLabelHe,
} from "@/lib/subscription-tier-config";

/** Mirrors EMAIL_RE in app/api/register/route.ts so the client rejects the same
 * addresses the server would, instead of failing only after submit. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const planParam = params.get("plan")?.trim() ?? "";

  const [step, setStep] = useState(0);
  const [orgType, setOrgType] = useState<OrgTypeKey>("company");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [orgName, setOrgName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // `plan` only expresses intent (it grants nothing server-side — see
  // app/api/register/route.ts); it just preselects the plan step.
  const [tier, setTier] = useState<string>(
    () => parseSubscriptionTier(planParam.toUpperCase()) ?? "FREE",
  );
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [paypalOrderId, setPaypalOrderId] = useState<string>("");
  const [industry, setIndustry] = useState<"CONSTRUCTION" | "COMPANY_MGMT">("COMPANY_MGMT");
  const [specialization, setSpecialization] = useState<string>("GENERAL_BUSINESS");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [enteringWorkspace, setEnteringWorkspace] = useState(false);

  // Read prelogin cookie to pre-fill construction trade
  useEffect(() => {
    try {
      const match = document.cookie.split(";").find((c) => c.trim().startsWith(`${PRELOGIN_TRADE_COOKIE}=`));
      if (match) {
        const val = match.split("=")[1]?.trim();
        if (val && CONSTRUCTION_TRADE_IDS.includes(val as (typeof CONSTRUCTION_TRADE_IDS)[number])) {
          setIndustry("CONSTRUCTION");
          setSpecialization(val);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Reset specialization to default when industry changes
  const handleSetIndustry = (ind: "CONSTRUCTION" | "COMPANY_MGMT") => {
    setIndustry(ind);
    setSpecialization(ind === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
  };

  // Options shown in the specialization step
  const specializationOptions = useMemo(() => {
    if (industry === "CONSTRUCTION") {
      return CONSTRUCTION_TRADE_IDS.map((id) => ({ id, label: constructionTradeLabelHe(id) }));
    }
    return BUSINESS_LINE_IDS.map((id) => ({ id, label: businessLineLabelHe(id) }));
  }, [industry]);

  const isPaidTier = tier !== "FREE";

  const tierOptions = useMemo(
    () =>
      (["FREE", ...paypalPurchasableTiers()] as string[]).map((key) => {
        const a = tierAllowance(key);
        const monthly = a.monthlyPriceIls ?? 0;
        return {
          key,
          label: tierLabelHe(key),
          monthlyPriceIls: monthly,
          // Annual mirrors getExpectedTierOrderAmountIls: 12 months less 20%.
          annualPriceIls: Math.round(monthly * 12 * 0.8 * 100) / 100,
          cheapScans: a.cheapScans,
          premiumScans: a.premiumScans,
        };
      }),
    [],
  );

  const steps = useMemo(
    () => [
      t("auth.register.steps.type"),
      t("auth.register.steps.specialization"),
      t("auth.register.steps.personal"),
      t("auth.register.steps.orgName"),
      t("auth.register.steps.plan"),
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
    // Validate each step as it is left, so a required field can't be skipped
    // and only surface as a failure on the final summary step.
    if (step === 2 && !EMAIL_RE.test(email.trim())) {
      toast.error(t("auth.hub.forgot.invalidEmail"));
      return;
    }
    if (step === 3 && orgName.trim().length < 2) {
      toast.error(t("auth.hub.register.orgNameRequired"));
      return;
    }
    if (step === 5 && (!passwordMeetsRules(password) || password !== passwordConfirm)) {
      toast.error(t("auth.hub.register.passwordInvalid"));
      return;
    }
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      toast.error(t("auth.hub.forgot.invalidEmail"));
      setStep(2);
      return;
    }
    if (orgName.trim().length < 2) {
      toast.error(t("auth.hub.register.orgNameRequired"));
      setStep(3);
      return;
    }
    if (!passwordMeetsRules(password) || password !== passwordConfirm) {
      toast.error(t("auth.hub.register.passwordInvalid"));
      return;
    }
    // A paid tier is only real once PayPal has approved an order; the server
    // re-verifies the order itself and ignores anything we claim here.
    if (isPaidTier && !paypalOrderId) {
      toast.error(t("auth.hub.register.paymentRequired"));
      return;
    }
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          name: name.trim() || null,
          organizationName: orgName.trim(),
          orgType: TYPE_TO_CUSTOMER[orgType],
          industry,
          constructionTrade: specialization,
          inviteToken: inviteToken || undefined,
          orgInviteToken: orgInviteToken || undefined,
          plan: planParam || undefined,
          orderID: paypalOrderId || undefined,
          password,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        pendingApproval?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? data.message ?? t("auth.hub.register.registerFailed"));
        return;
      }
      // Clear prelogin cookie after successful registration
      try {
        document.cookie = `${PRELOGIN_TRADE_COOKIE}=; max-age=0; path=/`;
      } catch {
        /* ignore */
      }
      const msg = data.message ?? "";
      const isPending =
        typeof data.pendingApproval === "boolean"
          ? data.pendingApproval
          : msg.includes("מנהל") || msg.includes("אישור");
      setPendingApproval(isPending);
      setDone(true);
      void import("@/lib/analytics/marketing-funnel").then(({ trackFunnelRegisterCompleted }) => {
        trackFunnelRegisterCompleted({ pendingApproval: isPending, source: "register_wizard" });
      });

      if (!isPending) {
        setEnteringWorkspace(true);
        const result = await signIn(
          "credentials",
          {
            email: normalizedEmail,
            password,
            redirect: false,
            callbackUrl: "/",
          },
          { maxAge: String(SESSION_MAX_AGE_DEFAULT_SEC) },
        );
        if (result?.ok) {
          router.push("/");
          return;
        }
        setEnteringWorkspace(false);
        toast.error(t("auth.hub.register.autoSignInFailed"));
      }
    } catch {
      toast.error(t("auth.hub.register.networkError"));
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
    tier, setTier, billingCycle, setBillingCycle,
    tierOptions, isPaidTier,
    paypalOrderId, setPaypalOrderId,
    industry, setIndustry: handleSetIndustry,
    specialization, setSpecialization,
    specializationOptions,
    busy, done, pendingApproval, enteringWorkspace,
    goLogin, goNext, submit,
  };
}
