"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { toast } from "sonner";
import {
  approvePendingRegistrationAction,
  rejectPendingRegistrationAction,
} from "@/app/actions/admin-subscriptions";
import {
  listPendingRegistrationsAction,
  listUsersForAdminAction,
  type AdminUserRow,
  type PendingRegistrationRow,
} from "@/app/actions/admin-console";
import { provisionUserAction } from "@/app/actions/admin-subscriptions";
import {
  manageSubsAdjustScansAction,
  manageSubsCreateManualUserAction,
  manageSubsDeleteOrganizationAction,
  manageSubsDeleteUserByEmailAction,
  manageSubsListOrganizationsAction,
  manageSubsUpdateSubscriptionAction,
} from "@/app/actions/manage-subscriptions";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import { normalizeIndustryType } from "@/lib/professions/config";
import type { PlatformConfig } from "@/lib/platform-settings";
import { TABS, type TabId } from "./types";
import { usePlatformAdminUtils } from "./usePlatformAdminUtils";

export function usePlatformAdmin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("subscriptions");
  const [orgs, setOrgs] = useState<ExecutiveOrgRow[]>([]);
  const [pending, setPending] = useState<PendingRegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState("FREE");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editIndustry, setEditIndustry] = useState("CONSTRUCTION");
  const [editConstructionTrade, setEditConstructionTrade] = useState("GENERAL_CONTRACTOR");
  const [createIndustry, setCreateIndustry] = useState("CONSTRUCTION");
  const [createConstructionTrade, setCreateConstructionTrade] = useState("GENERAL_CONTRACTOR");
  const [cheapDelta, setCheapDelta] = useState(0);
  const [premiumDelta, setPremiumDelta] = useState(0);
  const [approvePlan, setApprovePlan] = useState("DEALER");
  const [approveRole, setApproveRole] = useState("ORG_ADMIN");
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createOrgName, setCreateOrgName] = useState("");
  const [createTier, setCreateTier] = useState("FREE");
  const [createVip, setCreateVip] = useState(false);
  const [deleteOrgConfirm, setDeleteOrgConfirm] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [provisionEmail, setProvisionEmail] = useState("");
  const [provisionName, setProvisionName] = useState("");
  const [provisionOrgId, setProvisionOrgId] = useState("");
  const [provisionRole, setProvisionRole] = useState("EMPLOYEE");
  const [provisionSendEmail, setProvisionSendEmail] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [health, setHealth] = useState<{ checkedAt?: string; statuses?: { name: string; ok: boolean; detail: string }[] } | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [envStatus, setEnvStatus] = useState<Record<string, boolean> | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const applyTabNav = useCallback((view: WidgetViewState) => {
    const next = view.tab as TabId | undefined;
    if (next && TABS.some((t) => t.id === next)) setTab(next);
  }, []);
  const { pushView } = useSyncedWidgetNavigation(applyTabNav);
  const selectTab = useCallback((id: TabId) => { setTab(id); pushView({ tab: id }); }, [pushView]);

  const loadOrgs = useCallback(async () => {
    const data = await manageSubsListOrganizationsAction();
    if ("error" in data) { toast.error(data.error); return; }
    setOrgs(data);
  }, []);

  const loadPending = useCallback(async () => {
    const data = await listPendingRegistrationsAction();
    if ("error" in data) { toast.error(data.error); return; }
    setPending(data);
  }, []);

  const loadUsers = useCallback(async () => {
    const data = await listUsersForAdminAction();
    if ("error" in data) { toast.error(data.error); return; }
    setAdminUsers(data);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/platform-settings", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? t("platformAdmin.loadSettingsFailed")); return; }
    setPlatformConfig(data.config);
    setEnvStatus(data.envStatus);
  }, [t]);

  const loadHealth = useCallback(async () => {
    const res = await fetch("/api/admin/system-health", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) { toast.error(t("platformAdmin.loadHealthFailed")); return; }
    setHealth(data);
  }, [t]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrgs(), loadPending(), loadUsers(), loadSettings()]);
    setLoading(false);
  }, [loadOrgs, loadPending, loadUsers, loadSettings]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  useEffect(() => {
    if (!platformConfig) return;
    const def = normalizeIndustryType(platformConfig.defaultIndustryForRegistration);
    setCreateIndustry(def);
    setCreateConstructionTrade(def === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformConfig?.defaultIndustryForRegistration]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? null;

  useEffect(() => {
    if (selectedOrg) {
      setEditTier(selectedOrg.subscriptionTier);
      setEditStatus(selectedOrg.subscriptionStatus);
      setEditIndustry(normalizeIndustryType(selectedOrg.industry));
      setEditConstructionTrade(selectedOrg.constructionTrade ?? "GENERAL_CONTRACTOR");
    }
  }, [selectedOrg]);

  useEffect(() => { if (tab === "health" && !health) void loadHealth(); }, [tab, health, loadHealth]);
  useEffect(() => { if (tab === "users" && adminUsers.length === 0) void loadUsers(); }, [tab, adminUsers.length, loadUsers]);
  useEffect(() => { if (selectedOrgId && !provisionOrgId) setProvisionOrgId(selectedOrgId); }, [selectedOrgId, provisionOrgId]);

  const utils = usePlatformAdminUtils(loadHealth);

  const handleSaveSubscription = async () => {
    if (!selectedOrgId) return;
    const fd = new FormData();
    fd.set("organizationId", selectedOrgId); fd.set("tier", editTier); fd.set("subscriptionStatus", editStatus);
    fd.set("industry", editIndustry); fd.set("constructionTrade", editConstructionTrade);
    const r = await manageSubsUpdateSubscriptionAction(fd);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(t("platformAdmin.subscriptionUpdated"));
    await loadOrgs();
  };

  const handleAdjustScans = async () => {
    if (!selectedOrgId) return;
    const fd = new FormData();
    fd.set("organizationId", selectedOrgId); fd.set("cheapDelta", String(cheapDelta)); fd.set("premiumDelta", String(premiumDelta));
    const r = await manageSubsAdjustScansAction(fd);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(t("platformAdmin.scanCreditsUpdated"));
    setCheapDelta(0); setPremiumDelta(0);
    await loadOrgs();
  };

  const handleApprovePending = async (userId: string) => {
    const r = await approvePendingRegistrationAction(userId, approveRole, approvePlan);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(t("platformAdmin.pending.approved"));
    await loadPending(); await loadOrgs();
  };

  const handleRejectPending = async (userId: string, email: string) => {
    if (!window.confirm(t("platformAdmin.pending.removeConfirm", { email }))) return;
    setBusyAction(true);
    try {
      const r = await rejectPendingRegistrationAction(userId);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(t("platformAdmin.pending.removed"));
      await loadPending(); await loadOrgs();
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateOrg = async () => {
    setBusyAction(true);
    try {
      const fd = new FormData();
      fd.set("email", createEmail.trim().toLowerCase()); fd.set("name", createName.trim());
      fd.set("organizationName", createOrgName.trim()); fd.set("tier", createTier);
      fd.set("industry", createIndustry); fd.set("constructionTrade", createConstructionTrade);
      if (createVip) fd.set("vip", "on");
      const r = await manageSubsCreateManualUserAction(fd);
      if (!r.ok) { toast.error(r.error); return; }
      if (r.emailed) toast.success(t("platformAdmin.newSubscriptionEmailed"));
      else toast.warning(r.mailError ? `מנוי נוצר, אך המייל לא נשלח: ${r.mailError}` : "מנוי נוצר, אך שליחת המייל נכשלה — בדקו RESEND_API_KEY או SMTP ב-Vercel");
      setShowCreateOrg(false); setCreateEmail(""); setCreateName(""); setCreateOrgName(""); setCreateTier("FREE"); setCreateVip(false);
      setCreateIndustry(normalizeIndustryType(platformConfig?.defaultIndustryForRegistration ?? "CONSTRUCTION"));
      setCreateConstructionTrade(normalizeIndustryType(platformConfig?.defaultIndustryForRegistration ?? "CONSTRUCTION") === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
      await loadOrgs(); await loadUsers();
    } finally { setBusyAction(false); }
  };

  const handleDeleteOrg = async () => {
    if (!selectedOrg) return;
    if (!window.confirm(`למחוק את הארגון «${selectedOrg.name}» ואת כל המשתמשים והנתונים שלו? פעולה בלתי הפיכה.`)) return;
    setBusyAction(true);
    try {
      const fd = new FormData();
      fd.set("organizationId", selectedOrg.id); fd.set("confirmation", deleteOrgConfirm.trim());
      const r = await manageSubsDeleteOrganizationAction(fd);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(t("platformAdmin.orgDeleted")); setSelectedOrgId(null); setDeleteOrgConfirm("");
      await loadOrgs(); await loadUsers();
    } finally { setBusyAction(false); }
  };

  const handleDeleteUser = async (email: string) => {
    if (!window.confirm(`למחוק את המשתמש ${email}?`)) return;
    setBusyAction(true);
    try {
      const fd = new FormData();
      fd.set("email", email.trim().toLowerCase());
      const r = await manageSubsDeleteUserByEmailAction(fd);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(t("platformAdmin.userDeleted")); utils.setUserLookup(null); utils.setUserEmail("");
      await loadUsers(); await loadOrgs();
    } finally { setBusyAction(false); }
  };

  const handleProvisionUser = async () => {
    const orgId = provisionOrgId || selectedOrgId;
    if (!orgId) { toast.error(t("platformAdmin.selectOrg")); return; }
    setBusyAction(true);
    try {
      const fd = new FormData();
      fd.set("email", provisionEmail.trim().toLowerCase()); fd.set("name", provisionName.trim());
      fd.set("organizationId", orgId); fd.set("role", provisionRole); fd.set("useGenerated", "on");
      if (provisionSendEmail) fd.set("sendEmail", "on");
      const r = await provisionUserAction(fd);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.emailed ? t("platformAdmin.userCreatedEmailed") : t("platformAdmin.userCreated"));
      setProvisionEmail(""); setProvisionName(""); await loadUsers();
    } finally { setBusyAction(false); }
  };

  const savePlatformSettings = async () => {
    if (!platformConfig) return;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platformConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      setPlatformConfig(data.config);
      toast.success(t("platformAdmin.platformSettingsSaved"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("platformAdmin.saveFailed")); }
    finally { setSavingSettings(false); }
  };

  return {
    tab, selectTab, loading, refreshAll,
    orgs, selectedOrgId, setSelectedOrgId, selectedOrg,
    editTier, setEditTier, editStatus, setEditStatus,
    editIndustry, setEditIndustry, editConstructionTrade, setEditConstructionTrade,
    cheapDelta, setCheapDelta, premiumDelta, setPremiumDelta,
    deleteOrgConfirm, setDeleteOrgConfirm, showCreateOrg, setShowCreateOrg,
    createEmail, setCreateEmail, createName, setCreateName,
    createOrgName, setCreateOrgName, createTier, setCreateTier,
    createVip, setCreateVip, createIndustry, setCreateIndustry,
    createConstructionTrade, setCreateConstructionTrade,
    busyAction, platformConfig, setPlatformConfig,
    pending, approvePlan, setApprovePlan, approveRole, setApproveRole,
    adminUsers, provisionEmail, setProvisionEmail, provisionName, setProvisionName,
    provisionOrgId, setProvisionOrgId, provisionRole, setProvisionRole,
    provisionSendEmail, setProvisionSendEmail,
    health, envStatus, savingSettings,
    handleSaveSubscription, handleAdjustScans, handleApprovePending, handleRejectPending,
    handleCreateOrg, handleDeleteOrg, handleDeleteUser, handleProvisionUser,
    savePlatformSettings, loadHealth,
    ...utils,
  };
}
