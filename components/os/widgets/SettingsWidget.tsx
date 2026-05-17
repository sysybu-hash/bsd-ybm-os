"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState, useEffect, useCallback } from 'react';
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
import { toast } from 'sonner';

const ASSIGN_ROLES = [
  { value: 'EMPLOYEE', label: 'עובד' },
  { value: 'PROJECT_MGR', label: 'מנהל פרויקטים' },
  { value: 'CLIENT', label: 'לקוח' },
  { value: 'ORG_ADMIN', label: 'מנהל ארגון' },
] as const;

export default function SettingsWidget() {
  const { dir } = useI18n();
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
    logoSvg: ''
  });

  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState<string>('EMPLOYEE');
  const [assigning, setAssigning] = useState(false);
  const [driveSettings, setDriveSettings] = useState({
    driveFolderName: DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
    driveSyncEnabled: true,
    driveFolderId: null as string | null,
    lastSyncAt: null as string | null,
  });
  const [driveSaving, setDriveSaving] = useState(false);

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

      const branding = data.tenantSiteBrandingJson || {};

      setSettings({
        name: data.name || '',
        taxId: data.taxId || '',
        email: data.paypalMerchantEmail || '',
        website: data.tenantPublicDomain || '',
        logoSvg: branding.logoSvg || ''
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
            });
          }
        }
      } catch {
        /* Drive לא מחובר */
      }
    } catch (err) {
      toast.error('שגיאה בטעינת הגדרות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    void fetchSettings();
  }, [sessionStatus, session?.user?.id, session?.user?.organizationId, fetchSettings]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/svg+xml' && !file.type.startsWith('image/')) {
      toast.error('אנא בחר קובץ תמונה (רצוי SVG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSettings({ ...settings, logoSvg: base64 });
      toast.success('לוגו נטען בהצלחה');
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
          tenantSiteBrandingJson: {
            logoSvg: settings.logoSvg
          }
        })
      });
      
      if (!res.ok) throw new Error();
      toast.success('ההגדרות נשמרו בהצלחה');
    } catch (err) {
      toast.error('שגיאה בשמירת ההגדרות');
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'שגיאה בשמירה');
      if (data.settings) {
        setDriveSettings({
          driveFolderName: data.settings.driveFolderName,
          driveSyncEnabled: data.settings.driveSyncEnabled,
          driveFolderId: data.settings.driveFolderId ?? null,
          lastSyncAt: data.settings.lastSyncAt ?? null,
        });
      }
      toast.success('הגדרות Google Drive נשמרו');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בשמירת הגדרות Drive');
    } finally {
      setDriveSaving(false);
    }
  };

  const handleAssignUser = async () => {
    const email = assignEmail.trim().toLowerCase();
    if (!email) {
      toast.error('הזן אימייל של משתמש שכבר התחבר לפחות פעם אחת');
      return;
    }
    if (!assignTargetOrgId) {
      toast.error('לא נמצא מזהה ארגון לשיוך');
      return;
    }

    setAssigning(true);
    try {
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
        throw new Error(data.error || 'שגיאה בשיוך');
      }

      toast.success('המשתמש שויך לארגון בהצלחה', {
        description: 'כדי ש־Gemini Live והרשאות יתעדכנו מיד — מומלץ שהמשתמש יצא ויכנס שוב למערכת.',
      });
      setAssignEmail('');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בשיוך משתמש');
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
            <h2 className="text-xl font-bold text-[color:var(--foreground-main)]">הגדרות מערכת</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">ניהול פרטי העסק, לוגו והתראות גלובליות</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          שמור שינויים
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-2xl mx-auto space-y-10">
          
          {/* Business Profile */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Building2 size={18} className="text-indigo-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">פרופיל עסקי</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">שם העסק / חברה</label>
                <div className="relative">
                  <Building2 className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
                  <input 
                    value={settings.name}
                    onChange={(e) => setSettings({...settings, name: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder="לדוגמה: BSD-YBM פתרונות תשתית"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">ח&quot;פ / עוסק מורשה</label>
                <div className="relative">
                  <Hash className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
                  <input 
                    value={settings.taxId}
                    onChange={(e) => setSettings({...settings, taxId: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                    placeholder="מספר זיהוי מס"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">אימייל למשלוח התראות</label>
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
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">אתר אינטרנט</label>
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
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">מיתוג ולוגו</h3>
            </div>

            <div className="bg-[color:var(--background-main)]/30 border-2 border-dashed border-[color:var(--border-main)] rounded-[2rem] p-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-[color:var(--surface-card)]/50 rounded-3xl border border-[color:var(--border-main)] flex items-center justify-center mb-4 shadow-xl overflow-hidden relative">
                {settings.logoSvg ? (
                  <Image src={settings.logoSvg} alt="Business Logo" fill className="object-contain p-2" unoptimized />
                ) : (
                  <ImageIcon size={40} className="text-[color:var(--foreground-muted)] opacity-30" />
                )}
              </div>
              <h4 className="font-bold text-[color:var(--foreground-main)] mb-1">העלאת לוגו העסק</h4>
              <p className="text-xs text-[color:var(--foreground-muted)] mb-6 max-w-xs">מומלץ להשתמש בפורמט SVG לקבלת איכות מקסימלית בכל חלקי המערכת והמסמכים</p>
              
              <div className="flex gap-3">
                <label className="px-4 py-2 bg-[color:var(--surface-card)]/50 dark:bg-white/10 border border-[color:var(--border-main)] rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-main)] transition-all cursor-pointer">
                  <Upload size={14} /> בחר קובץ
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
                <button 
                  onClick={() => setSettings({ ...settings, logoSvg: '' })}
                  className="px-4 py-2 text-rose-500 text-xs font-bold hover:bg-rose-500/5 rounded-xl transition-all"
                >
                  הסר לוגו
                </button>
              </div>
            </div>
          </section>

          <section className="pt-6 border-t border-[color:var(--border-main)]/30">
            <div className="flex items-center gap-2 mb-6">
              <HardDrive size={18} className="text-blue-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                Google Drive
              </h3>
            </div>
            <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
              תיקיית ברירת מחדל ב-Drive לסנכרון דו-כיווני עם המערכת. אם אין refresh token — התנתקו והתחברו שוב עם Google (אישור הרשאות מלא).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">שם תיקיית סנכרון</label>
                <input
                  value={driveSettings.driveFolderName}
                  onChange={(e) => setDriveSettings({ ...driveSettings, driveFolderName: e.target.value })}
                  className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-[color:var(--foreground-main)]"
                  placeholder={DEFAULT_GOOGLE_DRIVE_FOLDER_NAME}
                />
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
                  סנכרון אוטומטי דו-כיווני
                </label>
              </div>
            </div>
            {driveSettings.driveFolderId ? (
              <p className="mt-3 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                מזהה תיקייה: {driveSettings.driveFolderId}
                {driveSettings.lastSyncAt
                  ? ` · סונכרן ${new Date(driveSettings.lastSyncAt).toLocaleString('he-IL')}`
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
                שמור הגדרות Drive
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.assign("/api/auth/google-start?callbackUrl=/");
                }}
                className="px-5 py-2 border border-[color:var(--border-main)] rounded-xl text-sm font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-soft)] transition-all"
              >
                חיבור מחדש ל-Google
              </button>
            </div>
          </section>

          {showAssignPanel && (
            <section className="pt-6 border-t border-[color:var(--border-main)]/30">
              <div className="flex items-center gap-2 mb-6">
                <UserPlus size={18} className="text-amber-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                  שיוך משתמשים לארגון
                </h3>
              </div>
              <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
                משתמש חייב להתחבר עם Google לפחות פעם אחת לפני השיוך. אחרי השיוך — יציאה והתחברות מחדש מעדכנות את העוזר הקולי (Gemini Live) והרשאות API.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2 md:col-span-1">
                  <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">אימייל משתמש</label>
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
                  <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">תפקיד בארגון</label>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value)}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
                  >
                    {ASSIGN_ROLES.map((r) => (
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
                    שייך לארגון
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Security & System */}
          <section className="pt-6 border-t border-[color:var(--border-main)]/30">
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6 flex items-start gap-4">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-1">אבטחת נתונים</h4>
                <p className="text-xs text-indigo-700/60 dark:text-indigo-400/60 leading-relaxed">
                  הגדרות אלו מסונכרנות ישירות לטבלת ה-Organization ב-PostgreSQL. הן משפיעות על כותרות החשבוניות, הצעות המחיר והתראות המערכת הנשלחות ללקוחות.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

