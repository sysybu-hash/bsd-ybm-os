"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  approvePendingRegistrationAction,
} from "@/app/actions/admin-subscriptions";
import {
  listPendingRegistrationsAction,
  type PendingRegistrationRow,
} from "@/app/actions/admin-console";
import {
  manageSubsAdjustScansAction,
  manageSubsListOrganizationsAction,
  manageSubsUpdateSubscriptionAction,
} from "@/app/actions/manage-subscriptions";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import { AUTOMATION_CATALOG } from "@/lib/os-automations/catalog";
import {
  ADMIN_SUBSCRIPTION_TIER_OPTIONS,
  tierLabelHe,
} from "@/lib/subscription-tier-config";
import type { PlatformConfig } from "@/lib/platform-settings";

type TabId = "subscriptions" | "pending" | "users" | "broadcast" | "health" | "settings";

type Props = {
  variant?: "page" | "widget";
};

const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: "subscriptions", label: "מנויים", icon: Users },
  { id: "pending", label: "הרשמות", icon: UserCheck },
  { id: "users", label: "משתמשים", icon: Users },
  { id: "broadcast", label: "שידורים", icon: Bell },
  { id: "health", label: "בריאות", icon: Activity },
  { id: "settings", label: "הגדרות", icon: Settings2 },
];

export default function PlatformAdminConsole({ variant = "page" }: Props) {
  const [tab, setTab] = useState<TabId>("subscriptions");
  const [orgs, setOrgs] = useState<ExecutiveOrgRow[]>([]);
  const [pending, setPending] = useState<PendingRegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState("FREE");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [cheapDelta, setCheapDelta] = useState(0);
  const [premiumDelta, setPremiumDelta] = useState(0);
  const [userEmail, setUserEmail] = useState("");
  const [userLookup, setUserLookup] = useState<Record<string, unknown> | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [health, setHealth] = useState<{ checkedAt?: string; statuses?: { name: string; ok: boolean; detail: string }[] } | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [envStatus, setEnvStatus] = useState<Record<string, boolean> | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [approvePlan, setApprovePlan] = useState("DEALER");
  const [approveRole, setApproveRole] = useState("ORG_ADMIN");

  const loadOrgs = useCallback(async () => {
    const data = await manageSubsListOrganizationsAction();
    if ("error" in data) {
      toast.error(data.error);
      return;
    }
    setOrgs(data);
  }, []);

  const loadPending = useCallback(async () => {
    const data = await listPendingRegistrationsAction();
    if ("error" in data) {
      toast.error(data.error);
      return;
    }
    setPending(data);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/platform-settings", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "טעינת הגדרות נכשלה");
      return;
    }
    setPlatformConfig(data.config);
    setEnvStatus(data.envStatus);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrgs(), loadPending(), loadSettings()]);
    setLoading(false);
  }, [loadOrgs, loadPending, loadSettings]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? null;

  useEffect(() => {
    if (selectedOrg) {
      setEditTier(selectedOrg.subscriptionTier);
      setEditStatus(selectedOrg.subscriptionStatus);
    }
  }, [selectedOrg]);

  const handleSaveSubscription = async () => {
    if (!selectedOrgId) return;
    const fd = new FormData();
    fd.set("organizationId", selectedOrgId);
    fd.set("tier", editTier);
    fd.set("subscriptionStatus", editStatus);
    const r = await manageSubsUpdateSubscriptionAction(fd);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("מנוי עודכן");
    await loadOrgs();
  };

  const handleAdjustScans = async () => {
    if (!selectedOrgId) return;
    const fd = new FormData();
    fd.set("organizationId", selectedOrgId);
    fd.set("cheapDelta", String(cheapDelta));
    fd.set("premiumDelta", String(premiumDelta));
    const r = await manageSubsAdjustScansAction(fd);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("יתרות סריקה עודכנו");
    setCheapDelta(0);
    setPremiumDelta(0);
    await loadOrgs();
  };

  const handleApprovePending = async (userId: string) => {
    const r = await approvePendingRegistrationAction(userId, approveRole, approvePlan);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("הרשמה אושרה");
    await loadPending();
    await loadOrgs();
  };

  const handleLookupUser = async () => {
    const email = userEmail.trim().toLowerCase();
    if (!email) return;
    const res = await fetch(`/api/admin/check-user?email=${encodeURIComponent(email)}`, {
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "חיפוש נכשל");
      return;
    }
    setUserLookup(data);
  };

  const handleBroadcast = async () => {
    const res = await fetch("/api/admin/broadcast-notification", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: broadcastTitle, body: broadcastBody }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "שידור נכשל");
      return;
    }
    toast.success(`שודר ל-${data.count ?? 0} משתמשים`);
    setBroadcastTitle("");
    setBroadcastBody("");
  };

  const loadHealth = async () => {
    const res = await fetch("/api/admin/system-health", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      toast.error("טעינת בריאות מערכת נכשלה");
      return;
    }
    setHealth(data);
  };

  useEffect(() => {
    if (tab === "health" && !health) void loadHealth();
  }, [tab, health]);

  const savePlatformSettings = async () => {
    if (!platformConfig) return;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platformConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      setPlatformConfig(data.config);
      toast.success("הגדרות פלטפורמה נשמרו");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSavingSettings(false);
    }
  };

  const shellClass =
    variant === "page"
      ? "min-h-screen bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
      : "h-full flex flex-col bg-[color:var(--background-main)] text-[color:var(--foreground-main)]";

  return (
    <div className={shellClass} dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
            <Shield size={22} />
          </span>
          <div>
            <h1 className="text-lg font-black">ניהול BSD-YBM</h1>
            <p className="text-xs text-[color:var(--foreground-muted)]">מנויים, משתמשים והגדרות פלטפורמה</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            רענון
          </button>
          {variant === "page" ? (
            <Link
              href="/"
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
            >
              חזרה למרחב העבודה
            </Link>
          ) : (
            <Link
              href="/app/admin"
              className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
            >
              ניהול מלא
            </Link>
          )}
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-[color:var(--border-main)] px-2 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className={`flex-1 overflow-y-auto p-4 ${variant === "widget" ? "min-h-0" : ""}`}>
        {tab === "subscriptions" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-xl border border-[color:var(--border-main)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface-soft)] text-[10px] uppercase tracking-widest text-[color:var(--foreground-muted)]">
                  <tr>
                    <th className="p-2 text-start">ארגון</th>
                    <th className="p-2 text-start">אימייל</th>
                    <th className="p-2 text-start">מנוי</th>
                    <th className="p-2 text-start">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr
                      key={o.id}
                      className={`cursor-pointer border-t border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)] ${
                        selectedOrgId === o.id ? "bg-blue-500/10" : ""
                      }`}
                      onClick={() => setSelectedOrgId(o.id)}
                    >
                      <td className="p-2 font-semibold">{o.name}</td>
                      <td className="p-2 text-xs text-[color:var(--foreground-muted)]">{o.primaryEmail ?? "—"}</td>
                      <td className="p-2">{tierLabelHe(o.subscriptionTier)}</td>
                      <td className="p-2">{o.subscriptionStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside className="rounded-xl border border-[color:var(--border-main)] p-4">
              {selectedOrg ? (
                <div className="space-y-3">
                  <h3 className="font-bold">{selectedOrg.name}</h3>
                  <p className="text-xs text-[color:var(--foreground-muted)]">
                    סריקות: {selectedOrg.cheapScansRemaining} זולות · {selectedOrg.premiumScansRemaining} פרימיום
                  </p>
                  <label className="block text-xs font-bold">רמת מנוי</label>
                  <select
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-2 text-sm"
                  >
                    {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {tierLabelHe(t)}
                      </option>
                    ))}
                  </select>
                  <label className="block text-xs font-bold">סטטוס</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-2 text-sm"
                  >
                    {["ACTIVE", "INACTIVE", "PENDING_APPROVAL", "TRIAL"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleSaveSubscription()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white"
                  >
                    <Save size={16} />
                    שמור מנוי
                  </button>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <input
                      type="number"
                      placeholder="Δ זולות"
                      value={cheapDelta || ""}
                      onChange={(e) => setCheapDelta(Number(e.target.value) || 0)}
                      className="rounded-lg border border-[color:var(--border-main)] p-2 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Δ פרימיום"
                      value={premiumDelta || ""}
                      onChange={(e) => setPremiumDelta(Number(e.target.value) || 0)}
                      className="rounded-lg border border-[color:var(--border-main)] p-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAdjustScans()}
                    className="w-full rounded-xl border border-[color:var(--border-main)] py-2 text-sm font-bold"
                  >
                    עדכן יתרות סריקה
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[color:var(--foreground-muted)]">בחרו ארגון מהטבלה לעריכה</p>
              )}
            </aside>
          </div>
        )}

        {tab === "pending" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 rounded-xl border border-[color:var(--border-main)] p-3">
              <label className="text-xs font-bold">
                תוכנית לאישור
                <select
                  value={approvePlan}
                  onChange={(e) => setApprovePlan(e.target.value)}
                  className="mt-1 block rounded-lg border border-[color:var(--border-main)] p-2 text-sm"
                >
                  {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {tierLabelHe(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold">
                תפקיד
                <select
                  value={approveRole}
                  onChange={(e) => setApproveRole(e.target.value)}
                  className="mt-1 block rounded-lg border border-[color:var(--border-main)] p-2 text-sm"
                >
                  <option value="ORG_ADMIN">מנהל ארגון</option>
                  <option value="PROJECT_MGR">מנהל פרויקטים</option>
                  <option value="EMPLOYEE">עובד</option>
                </select>
              </label>
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-[color:var(--foreground-muted)]">אין הרשמות ממתינות</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)] p-3"
                  >
                    <div>
                      <p className="font-bold">{u.email}</p>
                      <p className="text-xs text-[color:var(--foreground-muted)]">
                        {u.organizationName ?? "ללא ארגון"} · {new Date(u.createdAt).toLocaleString("he-IL")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleApprovePending(u.id)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                    >
                      אשר
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "users" && (
          <div className="max-w-xl space-y-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="אימייל לחיפוש"
                className="flex-1 rounded-xl border border-[color:var(--border-main)] p-3 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleLookupUser()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
              >
                חפש
              </button>
            </div>
            {userLookup ? (
              <pre className="overflow-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-4 text-xs">
                {JSON.stringify(userLookup, null, 2)}
              </pre>
            ) : null}
          </div>
        )}

        {tab === "broadcast" && (
          <div className="max-w-lg space-y-3">
            <input
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="כותרת התראה"
              className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-sm"
            />
            <textarea
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="תוכן ההתראה לכל המשתמשים הפעילים"
              rows={6}
              className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleBroadcast()}
              className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white"
            >
              שלח שידור
            </button>
          </div>
        )}

        {tab === "health" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void loadHealth()}
              className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold"
            >
              רענן בדיקה
            </button>
            {health?.statuses?.map((s) => (
              <div
                key={s.name}
                className={`rounded-xl border p-3 ${s.ok ? "border-emerald-500/30" : "border-rose-500/40"}`}
              >
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-[color:var(--foreground-muted)]">{s.detail}</p>
              </div>
            ))}
            {envStatus ? (
              <div className="rounded-xl border border-[color:var(--border-main)] p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                  משתני סביבה
                </p>
                <ul className="space-y-1 text-sm">
                  {Object.entries(envStatus).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className={v ? "text-emerald-600" : "text-rose-500"}>{v ? "מוגדר" : "חסר"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {tab === "settings" && platformConfig && (
          <div className="max-w-2xl space-y-4">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={platformConfig.maintenanceMode}
                onChange={(e) =>
                  setPlatformConfig({ ...platformConfig, maintenanceMode: e.target.checked })
                }
              />
              מצב תחזוקה
            </label>
            <textarea
              value={platformConfig.maintenanceMessage}
              onChange={(e) =>
                setPlatformConfig({ ...platformConfig, maintenanceMessage: e.target.value })
              }
              placeholder="הודעת תחזוקה"
              rows={2}
              className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-sm"
            />
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={platformConfig.registrationOpen}
                onChange={(e) =>
                  setPlatformConfig({ ...platformConfig, registrationOpen: e.target.checked })
                }
              />
              הרשמה פתוחה
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold">
                ימי ניסיון
                <input
                  type="number"
                  value={platformConfig.defaultTrialDays}
                  onChange={(e) =>
                    setPlatformConfig({
                      ...platformConfig,
                      defaultTrialDays: Number(e.target.value) || 30,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold">
                סריקות ניסיון
                <input
                  type="number"
                  value={platformConfig.defaultTrialScans}
                  onChange={(e) =>
                    setPlatformConfig({
                      ...platformConfig,
                      defaultTrialScans: Number(e.target.value) || 30,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm"
                />
              </label>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
              דגלי תכונות
            </p>
            {(["meckanoGlobal", "geminiLiveEnabled", "driveSyncDefault"] as const).map((flag) => (
              <label key={flag} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={platformConfig.featureFlags[flag]}
                  onChange={(e) =>
                    setPlatformConfig({
                      ...platformConfig,
                      featureFlags: {
                        ...platformConfig.featureFlags,
                        [flag]: e.target.checked,
                      },
                    })
                  }
                />
                {flag}
              </label>
            ))}
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
              אוטומציות (כיבוי = חסום)
            </p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[color:var(--border-main)] p-2">
              {AUTOMATION_CATALOG.map((entry) => (
                <label key={entry.id} className="flex items-center gap-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={platformConfig.automationEnabled[entry.id] !== false}
                    onChange={(e) =>
                      setPlatformConfig({
                        ...platformConfig,
                        automationEnabled: {
                          ...platformConfig.automationEnabled,
                          [entry.id]: e.target.checked,
                        },
                      })
                    }
                  />
                  {entry.labelHe}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void savePlatformSettings()}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              שמור הגדרות
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
