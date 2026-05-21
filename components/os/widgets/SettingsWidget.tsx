"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  Settings, 
  Building2, 
  Hash, 
  Mail, 
  Save, 
  Image as ImageIcon, 
  Upload,
  Loader2,
  ShieldCheck,
  Globe,
  UserPlus,
  HardDrive,
} from 'lucide-react';
import { DEFAULT_GOOGLE_DRIVE_FOLDER_NAME } from '@/lib/google-drive-config';
import ProfessionSettingsPanel from '@/components/os/widgets/settings/ProfessionSettingsPanel';
import PasskeySecuritySection from "@/components/auth/PasskeySecuritySection";
import { toast } from 'sonner';

const ASSIGN_ROLE_KEYS = [
  { value: 'EMPLOYEE', labelKey: 'workspaceWidgets.settings.roles.employee' },
  { value: 'PROJECT_MGR', labelKey: 'workspaceWidgets.settings.roles.projectMgr' },
  { value: 'CLIENT', labelKey: 'workspaceWidgets.settings.roles.client' },
  { value: 'ORG_ADMIN', labelKey: 'workspaceWidgets.settings.roles.orgAdmin' },
] as const;

const S = 'workspaceWidgets.settings';

export default function SettingsWidget() {
  const { dir, t } = useI18n();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    name: '',
    taxId: '',
    email: '',
    website: '',
    logoSvg: '',
    vatRatePercent: 18,
  });

  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState<string>('EMPLOYEE');
  const [assigning, setAssigning] = useState(false);
  const [driveSettings, setDriveSettings] = useState({
    driveFolderName: DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
    driveSyncEnabled: true,
    driveFolderId: null as string | null,
    lastSyncAt: null as string | null,
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
    () =>
      ASSIGN_ROLE_KEYS.map((r) => ({
        value: r.value,
        label: t(r.labelKey),
      })),
    [t],
  );

  const isSuper = session?.user?.role === 'SUPER_ADMIN';
  const isOrgAdmin = session?.user?.role === 'ORG_ADMIN';
  const assignTargetOrgId = isOrgAdmin
    ? (session?.user?.organizationId ?? '')
    : isSuper
      ? (session?.user?.organizationId ?? organizationId ?? '')
      : '';

  const showAssignPanel =
    (isOrgAdmin || isSuper) && assignTargetOrgId.length > 0;

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/organization', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data.id === 'string') {
        setOrganizationId(data.id);
      }
      if (typeof data.industry === 'string') {
        setOrgIndustry(data.industry);
      }
      if (typeof data.constructionTrade === 'string') {
        setOrgSpecialization(data.constructionTrade);
      }

      const branding = data.tenantSiteBrandingJson || {};

      setSettings({
        name: data.name || '',
        taxId: data.taxId || '',
        email: data.paypalMerchantEmail || '',
        website: data.tenantPublicDomain || '',
        logoSvg: branding.logoSvg || '',
        vatRatePercent:
          typeof data.vatRatePercent === 'number' && Number.isFinite(data.vatRatePercent)
            ? data.vatRatePercent
            : 18,
      });

      try {
        const driveRes = await fetch('/api/os/google-drive/settings', { credentials: 'include', cache: 'no-store' });
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
      } catch {
        /* Drive לא מחובר */
      }

      setDriveFoldersLoading(true);
      try {
        const foldersRes = await fetch('/api/os/google-drive/folders', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (foldersRes.ok) {
          const foldersData = (await foldersRes.json()) as {
            folders?: Array<{ id: string; name: string }>;
          };
          setDriveFolders(
            (foldersData.folders ?? []).filter((f) => f.id && f.name),
          );
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
    if (sessionStatus === 'loading') return;
    void fetchSettings();
  }, [sessionStatus, session?.user?.id, session?.user?.organizationId, fetchSettings]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/svg+xml' && !file.type.startsWith('image/')) {
      toast.error(t(`${S}.errors.invalidImage`));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSettings({ ...settings, logoSvg: base64 });
      toast.success(t(`${S}.toast.logoLoaded`));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/organization', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settings.name,
          taxId: settings.taxId,
          vatRatePercent: settings.vatRatePercent,
          tenantSiteBrandingJson: {
            logoSvg: settings.logoSvg
          }
        })
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
      const res = await fetch('/api/os/google-drive/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
      toast.error(
        e instanceof Error ? e.message : t(`${S}.errors.driveSaveFailedFull`),
      );
    } finally {
      setDriveSaving(false);
    }
  };

  const handleAssignUser = async () => {
    const email = assignEmail.trim().toLowerCase();
    if (!email) {
      toast.error(t(`${S}.errors.assignEmailRequired`));
      return;
    }
    if (!assignTargetOrgId) {
      toast.error(t(`${S}.errors.assignNoOrg`));
      return;
    }

    setAssigning(true);
    try {
      const verifyRes = await fetch(
        `/api/org/check-email-verified?email=${encodeURIComponent(email)}`,
        { credentials: 'include' },
      );
      const verifyData = (await verifyRes.json().catch(() => ({}))) as { isVerified?: boolean };
      if (verifyRes.ok && !verifyData.isVerified) {
        const proceed = confirm(
          t(`${S}.confirmUnverifiedEmail`, { email }),
        );
        if (!proceed) return;
        await fetch('/api/org/resend-verification', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      }

      const res = await fetch('/api/assign-user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          organizationId: assignTargetOrgId,
          role: assignRole,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };

      if (!res.ok) {
        throw new Error(data.error || t(`${S}.errors.assignFailed`));
      }

      toast.success(t(`${S}.toast.assigned`), {
        description: t(`${S}.toast.assignedHint`),
      });
      setAssignEmail('');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(`${S}.errors.assignFailedUser`));
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-transparent">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--foreground-muted)]/10 flex items-center justify-center text-[color:var(--foreground-muted)]">
            <Settings size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--foreground-main)]">{t(`${S}.title`)}</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${S}.subtitle`)}</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t(`${S}.saveChanges`)}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-2xl mx-auto space-y-10">

          <ProfessionSettingsPanel
            initialIndustry={orgIndustry ?? session?.user?.organizationIndustry}
            initialSpecialization={
              orgSpecialization ??
              (session?.user as { organizationConstructionTrade?: string | null } | undefined)
                ?.organizationConstructionTrade
            }
          />
          
          {/* Business Profile */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Building2 size={18} className="text-indigo-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">{t(`${S}.businessProfile`)}</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.businessName`)}</label>
                <div className="relative">
                  <Building2 className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
                  <input 
                    value={settings.name}
                    onChange={(e) => setSettings({...settings, name: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder={t(`${S}.businessNamePlaceholder`)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.taxId`)}</label>
                <div className="relative">
                  <Hash className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
                  <input 
                    value={settings.taxId}
                    onChange={(e) => setSettings({...settings, taxId: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder={t(`${S}.taxIdPlaceholder`)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.vatRate`)}</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.vatRatePercent}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        vatRatePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                  />
                </div>
                <p className="text-[10px] text-[color:var(--foreground-muted)] pr-1">
                  {t(`${S}.vatHint`)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.notificationEmail`)}</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
                  <input 
                    value={settings.email}
                    onChange={(e) => setSettings({...settings, email: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.website`)}</label>
                <div className="relative">
                  <Globe className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
                  <input 
                    value={settings.website}
                    onChange={(e) => setSettings({...settings, website: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder="www.example.com"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Logo & Branding */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ImageIcon size={18} className="text-emerald-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">{t(`${S}.branding`)}</h3>
            </div>

            <div className="bg-[color:var(--background-main)]/30 border-2 border-dashed border-[color:var(--border-main)] rounded-[2rem] p-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-[color:var(--surface-card)]/50 rounded-3xl border border-[color:var(--border-main)] flex items-center justify-center mb-4 shadow-xl overflow-hidden relative">
                {settings.logoSvg ? (
                  <Image src={settings.logoSvg} alt="Business Logo" fill className="object-contain p-2" unoptimized />
                ) : (
                  <ImageIcon size={40} className="text-[color:var(--foreground-muted)] opacity-30" />
                )}
              </div>
              <h4 className="font-bold text-[color:var(--foreground-main)] mb-1">{t(`${S}.uploadLogoTitle`)}</h4>
              <p className="text-xs text-[color:var(--foreground-muted)] mb-6 max-w-xs">{t(`${S}.uploadLogoDesc`)}</p>
              
              <div className="flex gap-3">
                <label className="px-4 py-2 bg-[color:var(--surface-card)]/50 dark:bg-white/10 border border-[color:var(--border-main)] rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-main)] transition-all cursor-pointer">
                  <Upload size={14} /> {t(`${S}.chooseFile`)}
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
                <button 
                  onClick={() => setSettings({ ...settings, logoSvg: '' })}
                  className="px-4 py-2 text-rose-500 text-xs font-bold hover:bg-rose-500/5 rounded-xl transition-all"
                >
                  {t(`${S}.removeLogo`)}
                </button>
              </div>
            </div>
          </section>

          <section className="pt-6 border-t border-[color:var(--border-main)]/30">
            <div className="flex items-center gap-2 mb-6">
              <HardDrive size={18} className="text-blue-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t(`${S}.driveSection`)}
              </h3>
            </div>
            <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
              {t(`${S}.driveIntro`)}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">
                  {t(`${S}.driveFolder`)}
                </label>
                {driveFolders.length > 0 ? (
                  <select
                    value={driveSettings.driveFolderId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      const folder = driveFolders.find((f) => f.id === id);
                      setDriveSettings({
                        ...driveSettings,
                        driveFolderId: id || null,
                        driveFolderName: folder?.name ?? driveSettings.driveFolderName,
                      });
                    }}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-[color:var(--foreground-main)]"
                  >
                    <option value="">{t(`${S}.driveFolderPlaceholder`)}</option>
                    {driveFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={driveSettings.driveFolderName}
                    onChange={(e) =>
                      setDriveSettings({ ...driveSettings, driveFolderName: e.target.value })
                    }
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-[color:var(--foreground-main)]"
                    placeholder={DEFAULT_GOOGLE_DRIVE_FOLDER_NAME}
                  />
                )}
                {driveFoldersLoading ? (
                  <p className="text-[10px] text-[color:var(--foreground-muted)]">{t(`${S}.driveFoldersLoading`)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3 pb-2">
                <input
                  id="drive-sync-enabled"
                  type="checkbox"
                  checked={driveSettings.driveSyncEnabled}
                  onChange={(e) => setDriveSettings({ ...driveSettings, driveSyncEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[color:var(--border-main)]"
                />
                <label htmlFor="drive-sync-enabled" className="text-sm font-semibold text-[color:var(--foreground-main)]">
                  {t(`${S}.driveSyncAuto`)}
                </label>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={driveSettings.driveAutoDecodeOnSync}
                  onChange={(e) =>
                    setDriveSettings({ ...driveSettings, driveAutoDecodeOnSync: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[color:var(--border-main)]"
                />
                {t(`${S}.driveAutoDecode`)}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={driveSettings.driveAutoSaveAfterDecode}
                  onChange={(e) =>
                    setDriveSettings({ ...driveSettings, driveAutoSaveAfterDecode: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[color:var(--border-main)]"
                />
                {t(`${S}.driveAutoSave`)}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={driveSettings.driveAskBeforeSave}
                  onChange={(e) =>
                    setDriveSettings({ ...driveSettings, driveAskBeforeSave: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[color:var(--border-main)]"
                />
                {t(`${S}.driveAskBeforeSave`)}
              </label>
            </div>
            {driveSettings.driveFolderId ? (
              <p className="mt-3 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {t(`${S}.driveFolderId`, { id: driveSettings.driveFolderId })}
                {driveSettings.lastSyncAt
                  ? t(`${S}.driveLastSync`, {
                      at: new Date(driveSettings.lastSyncAt).toLocaleString('he-IL'),
                    })
                  : ''}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveDriveSettings()}
                disabled={driveSaving}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
              >
                {driveSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {t(`${S}.saveDriveSettings`)}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.assign("/api/auth/google-reconnect?callbackUrl=/");
                }}
                className="px-5 py-2 border border-[color:var(--border-main)] rounded-xl text-sm font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-soft)] transition-all"
              >
                {t(`${S}.reconnectGoogle`)}
              </button>
            </div>
          </section>

          {showAssignPanel && (
            <section className="pt-6 border-t border-[color:var(--border-main)]/30">
              <div className="flex items-center gap-2 mb-6">
                <UserPlus size={18} className="text-amber-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                  {t(`${S}.assignSection`)}
                </h3>
              </div>
              <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
                {t(`${S}.assignIntro`)}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2 md:col-span-1">
                  <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.assignEmail`)}</label>
                  <input
                    type="email"
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder="user@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.assignRole`)}</label>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value)}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                  >
                    {assignRoles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => void handleAssignUser()}
                    disabled={assigning}
                    className="w-full md:w-auto bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    {assigning ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                    {t(`${S}.assignSubmit`)}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Security & System */}
          <section className="pt-6 border-t border-[color:var(--border-main)]/30">
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6">
              <div className="mb-4 flex items-start gap-4">
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-indigo-900 dark:text-indigo-300">
                    {t(`${S}.securityTitle`)}
                  </h4>
                  <p className="text-xs leading-relaxed text-indigo-700/60 dark:text-indigo-400/60">
                    {t(`${S}.securityDesc`)}
                  </p>
                </div>
              </div>
              <PasskeySecuritySection />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
