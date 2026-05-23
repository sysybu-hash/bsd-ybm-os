"use client";

import React from "react";
import Link from "next/link";
import { Activity, Loader2, RefreshCw, Shield } from "lucide-react";
import { ADMIN_SUBSCRIPTION_TIER_OPTIONS, tierLabelHe } from "@/lib/subscription-tier-config";
import { normalizeIndustryType } from "@/lib/professions/config";
import { osFieldClassName } from "@/components/os/ui/os-field";
import AdminAssistantTab from "@/components/admin/AdminAssistantTab";
import { usePlatformAdmin } from "./platform-admin/usePlatformAdmin";
import { SubscriptionsTab } from "./platform-admin/SubscriptionsTab";
import { UsersTab } from "./platform-admin/UsersTab";
import { SettingsTab } from "./platform-admin/SettingsTab";
import { TABS, type PlatformAdminConsoleProps, type TabId } from "./platform-admin/types";

export default function PlatformAdminConsole({ variant = "page" }: PlatformAdminConsoleProps) {
  const p = usePlatformAdmin();

  const shellClass =
    variant === "page"
      ? "min-h-screen bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
      : "h-full flex flex-col bg-[color:var(--background-main)] text-[color:var(--foreground-main)]";

  return (
    <div className={shellClass} dir="rtl">
      {/* ── Header ─────────────────────────────────────────────── */}
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
            onClick={() => void p.refreshAll()}
            className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
          >
            {p.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            רענון
          </button>
          {variant === "page" ? (
            <Link href="/" className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500">
              חזרה למרחב העבודה
            </Link>
          ) : (
            <Link href="/app/admin" className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]">
              ניהול מלא
            </Link>
          )}
        </div>
      </header>

      {/* ── Tab nav ────────────────────────────────────────────── */}
      <nav className="flex gap-1 overflow-x-auto border-b border-[color:var(--border-main)] px-2 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = p.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => p.selectTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                active ? "bg-blue-600 text-white" : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* ── Content ────────────────────────────────────────────── */}
      <main className={`flex-1 overflow-y-auto p-4 ${variant === "widget" ? "min-h-0" : ""}`}>

        {p.tab === "subscriptions" && (
          <SubscriptionsTab
            orgs={p.orgs}
            selectedOrgId={p.selectedOrgId}
            setSelectedOrgId={p.setSelectedOrgId}
            selectedOrg={p.selectedOrg}
            editTier={p.editTier} setEditTier={p.setEditTier}
            editStatus={p.editStatus} setEditStatus={p.setEditStatus}
            editIndustry={p.editIndustry} setEditIndustry={p.setEditIndustry}
            editConstructionTrade={p.editConstructionTrade} setEditConstructionTrade={p.setEditConstructionTrade}
            cheapDelta={p.cheapDelta} setCheapDelta={p.setCheapDelta}
            premiumDelta={p.premiumDelta} setPremiumDelta={p.setPremiumDelta}
            deleteOrgConfirm={p.deleteOrgConfirm} setDeleteOrgConfirm={p.setDeleteOrgConfirm}
            showCreateOrg={p.showCreateOrg} setShowCreateOrg={p.setShowCreateOrg}
            createEmail={p.createEmail} setCreateEmail={p.setCreateEmail}
            createName={p.createName} setCreateName={p.setCreateName}
            createOrgName={p.createOrgName} setCreateOrgName={p.setCreateOrgName}
            createTier={p.createTier} setCreateTier={p.setCreateTier}
            createVip={p.createVip} setCreateVip={p.setCreateVip}
            createIndustry={p.createIndustry} setCreateIndustry={p.setCreateIndustry}
            createConstructionTrade={p.createConstructionTrade} setCreateConstructionTrade={p.setCreateConstructionTrade}
            busyAction={p.busyAction}
            platformConfig={p.platformConfig}
            onSaveSubscription={() => void p.handleSaveSubscription()}
            onAdjustScans={() => void p.handleAdjustScans()}
            onCreateOrg={() => void p.handleCreateOrg()}
            onDeleteOrg={() => void p.handleDeleteOrg()}
          />
        )}

        {p.tab === "pending" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 rounded-xl border border-[color:var(--border-main)] p-3">
              <label className="text-xs font-bold">
                תוכנית לאישור
                <select value={p.approvePlan} onChange={(e) => p.setApprovePlan(e.target.value)} className={`mt-1 block ${osFieldClassName}`}>
                  {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((t) => <option key={t} value={t}>{tierLabelHe(t)}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">
                תפקיד
                <select value={p.approveRole} onChange={(e) => p.setApproveRole(e.target.value)} className={`mt-1 block ${osFieldClassName}`}>
                  <option value="ORG_ADMIN">מנהל ארגון</option>
                  <option value="PROJECT_MGR">מנהל פרויקטים</option>
                  <option value="EMPLOYEE">עובד</option>
                </select>
              </label>
            </div>
            {p.pending.length === 0 ? (
              <p className="text-sm text-[color:var(--foreground-muted)]">אין הרשמות ממתינות</p>
            ) : (
              <ul className="space-y-2">
                {p.pending.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)] p-3">
                    <div>
                      <p className="font-bold">{u.email}</p>
                      <p className="text-xs text-[color:var(--foreground-muted)]">
                        {u.organizationName ?? "ללא ארגון"}
                        {u.organizationIndustry ? (
                          <span className="me-1 rounded bg-[color:var(--surface-soft)] px-1.5 py-0.5 font-bold">
                            {normalizeIndustryType(u.organizationIndustry) === "COMPANY_MGMT" ? "ניהול עסק" : "בנייה"}
                          </span>
                        ) : null}
                        {" · "}{new Date(u.createdAt).toLocaleString("he-IL")}
                      </p>
                    </div>
                    <button type="button" onClick={() => void p.handleApprovePending(u.id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
                      אשר
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {p.tab === "users" && (
          <UsersTab
            adminUsers={p.adminUsers}
            orgs={p.orgs}
            provisionEmail={p.provisionEmail} setProvisionEmail={p.setProvisionEmail}
            provisionName={p.provisionName} setProvisionName={p.setProvisionName}
            provisionOrgId={p.provisionOrgId} setProvisionOrgId={p.setProvisionOrgId}
            provisionRole={p.provisionRole} setProvisionRole={p.setProvisionRole}
            provisionSendEmail={p.provisionSendEmail} setProvisionSendEmail={p.setProvisionSendEmail}
            userEmail={p.userEmail} setUserEmail={p.setUserEmail}
            userLookup={p.userLookup}
            busyAction={p.busyAction}
            onProvisionUser={() => void p.handleProvisionUser()}
            onDeleteUser={(email) => void p.handleDeleteUser(email)}
            onLookupUser={() => void p.handleLookupUser()}
          />
        )}

        {p.tab === "broadcast" && (
          <div className="max-w-lg space-y-3">
            <input value={p.broadcastTitle} onChange={(e) => p.setBroadcastTitle(e.target.value)}
              placeholder="כותרת התראה" className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-sm" />
            <textarea value={p.broadcastBody} onChange={(e) => p.setBroadcastBody(e.target.value)}
              placeholder="תוכן ההתראה לכל המשתמשים הפעילים" rows={6}
              className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-sm" />
            <button type="button" onClick={() => void p.handleBroadcast()}
              className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white">
              שלח שידור
            </button>
          </div>
        )}

        {p.tab === "health" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void p.loadHealth()}
                className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold">
                רענן בדיקה
              </button>
              <button type="button" disabled={p.testingEmail} onClick={() => void p.handleTestEmail()}
                className="rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {p.testingEmail ? "שולח…" : "שלח מייל בדיקה"}
              </button>
            </div>
            {p.health?.statuses?.map((s) => (
              <div key={s.name} className={`rounded-xl border p-3 ${s.ok ? "border-emerald-500/30" : "border-rose-500/40"}`}>
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-[color:var(--foreground-muted)]">{s.detail}</p>
              </div>
            ))}
            {p.envStatus ? (
              <div className="rounded-xl border border-[color:var(--border-main)] p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                  <Activity size={12} className="me-1 inline" />
                  משתני סביבה
                </p>
                <ul className="space-y-1 text-sm">
                  {Object.entries(p.envStatus).map(([k, v]) => (
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

        {p.tab === "assistant" && (
          <AdminAssistantTab onNavigateTab={(id) => p.selectTab(id as TabId)} />
        )}

        {p.tab === "settings" && p.platformConfig && (
          <SettingsTab
            platformConfig={p.platformConfig}
            setPlatformConfig={p.setPlatformConfig}
            savingSettings={p.savingSettings}
            onSave={() => void p.savePlatformSettings()}
          />
        )}

      </main>
    </div>
  );
}
