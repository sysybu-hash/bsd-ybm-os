"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { DEFAULT_GOOGLE_DRIVE_FOLDER_NAME } from "@/lib/google-drive-config";
import { toast } from "sonner";

const S = "workspaceWidgets.settings";

const ASSIGN_ROLE_KEYS = [
  { value: "EMPLOYEE", labelKey: "workspaceWidgets.settings.roles.employee" },
  { value: "PROJECT_MGR", labelKey: "workspaceWidgets.settings.roles.projectMgr" },
  { value: "CLIENT", labelKey: "workspaceWidgets.settings.roles.client" },
  { value: "ORG_ADMIN", labelKey: "workspaceWidgets.settings.roles.orgAdmin" },
] as const;

export type OrgSettings = {
  name: string;
  taxId: string;
  email: string;
  website: string;
  logoSvg: string;
  vatRatePercent: number;
};

export type DriveSettings = {
  driveFolderName: string;
  driveSyncEnabled: boolean;
  driveFolderId: string | null;
  lastSyncAt: string | null;
  driveAutoDecodeOnSync: boolean;
  driveAutoSaveAfterDecode: boolean;
  driveAskBeforeSave: boolean;
};

export function useSettingsWidget() {
  const { t } = useI18n();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrgSettings>({
    name: "",
    taxId: "",
    email: "",
    website: "",
    logoSvg: "",
    vatRatePercent: 18,
  });

  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState("EMPLOYEE");
  const [assigning, setAssigning] = useState(false);

  const [driveSettings, setDriveSettings] = useState<DriveSettings>({
    driveFolderName: DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
    driveSyncEnabled: true,
    driveFolderId: null,
    lastSyncAt: null,
    driveAutoDecodeOnSync: false,
    driveAutoSaveAfterDecode: false,
    driveAskBeforeSave: true,
  });
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveFolders, setDriveFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [driveFoldersLoading, setDriveFoldersLoading] = useState(false);
  const [orgIndustry, setOrgIndustry] = useState<string | null>(null);
  const [orgSpecialization, setOrgSpecialization] = useState<string | null>(null);

  const assignRoles = useMemo(
    () => ASSIGN_ROLE_KEYS.map((r) => ({ value: r.value, label: t(r.labelKey) })),
    [t],
  );

  const isSuper = session?.user?.role === "SUPER_ADMIN";
  const isOrgAdmin = session?.user?.role === "ORG_ADMIN";
  const assignTargetOrgId = isOrgAdmin
    ? (session?.user?.organizationId ?? "")
    : isSuper
      ? (session?.user?.organizationId ?? organizationId ?? "")
      : "";
  const showAssignPanel = (isOrgAdmin || isSuper) && assignTargetOrgId.length > 0;

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/organization", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data.id === "string") setOrganizationId(data.id);
      if (typeof data.industry === "string") setOrgIndustry(data.industry);
      if (typeof data.constructionTrade === "string") setOrgSpecialization(data.constructionTrade);

      const branding = data.tenantSiteBrandingJson || {};
      setSettings({
        name: data.name || "",
        taxId: data.taxId || "",
        email: data.paypalMerchantEmail || "",
        website: data.tenantPublicDomain || "",
        logoSvg: branding.logoSvg || "",
        vatRatePercent:
          typeof data.vatRatePercent === "number" && Number.isFinite(data.vatRatePercent)
            ? data.vatRatePercent
            : 18,
      });

      try {
        const driveRes = await fetch("/api/os/google-drive/settings", { credentials: "include", cache: "no-store" });
        if (driveRes.ok) {
          const driveData = await driveRes.json();
          if (driveData.settings) {
            setDriveSettings({
              driveFolderName: driveData.settings.driveFolderName ?? DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
              driveSyncEnabled: driveData.settings.driveSyncEnabled ?? true,
              driveFolderId: driveData.settings.driveFolderId ?? null,
              lastSyncAt: driveData.settings.lastSyncAt ?? null,
              driveAutoDecodeOnSync: driveData.settings.driveAutoDecodeOnSync ?? false,
              driveAutoSaveAfterDecode: driveData.settings.driveAutoSaveAfterDecode ?? false,
              driveAskBeforeSave: driveData.settings.driveAskBeforeSave ?? true,
            });
          }
        }
      } catch { /* Drive not connected */ }

      setDriveFoldersLoading(true);
      try {
        const foldersRes = await fetch("/api/os/google-drive/folders", { credentials: "include", cache: "no-store" });
        if (foldersRes.ok) {
          const foldersData = (await foldersRes.json()) as { folders?: Array<{ id: string; name: string }> };
          setDriveFolders((foldersData.folders ?? []).filter((f) => f.id && f.name));
        }
      } catch {
        setDriveFolders([]);
      } finally {
        setDriveFoldersLoading(false);
      }
    } catch {
      toast.error(t(`${S}.errors.loadFailed`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    void fetchSettings();
  }, [sessionStatus, session?.user?.id, session?.user?.organizationId, fetchSettings]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/svg+xml" && !file.type.startsWith("image/")) {
      toast.error(t(`${S}.errors.invalidImage`));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSettings((prev) => ({ ...prev, logoSvg: base64 }));
      toast.success(t(`${S}.toast.logoLoaded`));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/organization", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settings.name,
          taxId: settings.taxId,
          vatRatePercent: settings.vatRatePercent,
          tenantSiteBrandingJson: { logoSvg: settings.logoSvg },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t(`${S}.toast.saved`));
    } catch {
      toast.error(t(`${S}.errors.saveFailed`));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDriveSettings = async () => {
    setDriveSaving(true);
    try {
      const res = await fetch("/api/os/google-drive/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFolderName: driveSettings.driveFolderName.trim(),
          driveSyncEnabled: driveSettings.driveSyncEnabled,
          driveAutoDecodeOnSync: driveSettings.driveAutoDecodeOnSync,
          driveAutoSaveAfterDecode: driveSettings.driveAutoSaveAfterDecode,
          driveAskBeforeSave: driveSettings.driveAskBeforeSave,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t(`${S}.errors.driveSaveFailed`));
      if (data.settings) {
        setDriveSettings({
          driveFolderName: data.settings.driveFolderName,
          driveSyncEnabled: data.settings.driveSyncEnabled,
          driveFolderId: data.settings.driveFolderId ?? null,
          lastSyncAt: data.settings.lastSyncAt ?? null,
          driveAutoDecodeOnSync: data.settings.driveAutoDecodeOnSync ?? false,
          driveAutoSaveAfterDecode: data.settings.driveAutoSaveAfterDecode ?? false,
          driveAskBeforeSave: data.settings.driveAskBeforeSave ?? true,
        });
      }
      toast.success(t(`${S}.toast.driveSaved`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(`${S}.errors.driveSaveFailedFull`));
    } finally {
      setDriveSaving(false);
    }
  };

  const handleAssignUser = async () => {
    const email = assignEmail.trim().toLowerCase();
    if (!email) { toast.error(t(`${S}.errors.assignEmailRequired`)); return; }
    if (!assignTargetOrgId) { toast.error(t(`${S}.errors.assignNoOrg`)); return; }

    setAssigning(true);
    try {
      const verifyRes = await fetch(`/api/org/check-email-verified?email=${encodeURIComponent(email)}`, { credentials: "include" });
      const verifyData = (await verifyRes.json().catch(() => ({}))) as { isVerified?: boolean };
      if (verifyRes.ok && !verifyData.isVerified) {
        const proceed = confirm(t(`${S}.confirmUnverifiedEmail`, { email }));
        if (!proceed) return;
        await fetch("/api/org/resend-verification", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      }
      const res = await fetch("/api/assign-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, organizationId: assignTargetOrgId, role: assignRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t(`${S}.errors.assignFailed`));
      toast.success(t(`${S}.toast.assigned`), { description: t(`${S}.toast.assignedHint`) });
      setAssignEmail("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(`${S}.errors.assignFailedUser`));
    } finally {
      setAssigning(false);
    }
  };

  return {
    loading, saving, settings, setSettings,
    assignEmail, setAssignEmail, assignRole, setAssignRole, assigning, assignRoles,
    showAssignPanel,
    driveSettings, setDriveSettings, driveSaving, driveFolders, driveFoldersLoading,
    orgIndustry, orgSpecialization,
    session,
    handleLogoUpload, handleSave, handleSaveDriveSettings, handleAssignUser,
  };
}
