"use client";

import React from "react";
import { Loader2, Plus, Save, Trash2, UserPlus } from "lucide-react";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import { ADMIN_SUBSCRIPTION_TIER_OPTIONS, tierLabelHe } from "@/lib/subscription-tier-config";
import { BUSINESS_LINE_IDS, businessLineLabelHe } from "@/lib/business-lines";
import { CONSTRUCTION_TRADE_IDS, constructionTradeLabelHe } from "@/lib/construction-trades";
import { normalizeIndustryType, industryLabelHe } from "@/lib/professions/config";
import type { PlatformConfig } from "@/lib/platform-settings";
import { osFieldClassName, osFieldInlineClassName } from "@/components/os/ui/os-field";

type SubscriptionsTabProps = {
  orgs: ExecutiveOrgRow[];
  selectedOrgId: string | null;
  setSelectedOrgId: (id: string) => void;
  selectedOrg: ExecutiveOrgRow | null;
  editTier: string; setEditTier: (v: string) => void;
  editStatus: string; setEditStatus: (v: string) => void;
  editIndustry: string; setEditIndustry: (v: string) => void;
  editConstructionTrade: string; setEditConstructionTrade: (v: string) => void;
  cheapDelta: number; setCheapDelta: (v: number) => void;
  premiumDelta: number; setPremiumDelta: (v: number) => void;
  deleteOrgConfirm: string; setDeleteOrgConfirm: (v: string) => void;
  showCreateOrg: boolean; setShowCreateOrg: (v: (prev: boolean) => boolean) => void;
  createEmail: string; setCreateEmail: (v: string) => void;
  createName: string; setCreateName: (v: string) => void;
  createOrgName: string; setCreateOrgName: (v: string) => void;
  createTier: string; setCreateTier: (v: string) => void;
  createVip: boolean; setCreateVip: (v: boolean) => void;
  createIndustry: string; setCreateIndustry: (v: string) => void;
  createConstructionTrade: string; setCreateConstructionTrade: (v: string) => void;
  busyAction: boolean;
  platformConfig: PlatformConfig | null;
  onSaveSubscription: () => void;
  onAdjustScans: () => void;
  onCreateOrg: () => void;
  onDeleteOrg: () => void;
};

export function SubscriptionsTab({
  orgs, selectedOrgId, setSelectedOrgId, selectedOrg,
  editTier, setEditTier, editStatus, setEditStatus,
  editIndustry, setEditIndustry, editConstructionTrade, setEditConstructionTrade,
  cheapDelta, setCheapDelta, premiumDelta, setPremiumDelta,
  deleteOrgConfirm, setDeleteOrgConfirm,
  showCreateOrg, setShowCreateOrg,
  createEmail, setCreateEmail, createName, setCreateName,
  createOrgName, setCreateOrgName, createTier, setCreateTier,
  createVip, setCreateVip, createIndustry, setCreateIndustry,
  createConstructionTrade, setCreateConstructionTrade,
  busyAction,
  onSaveSubscription, onAdjustScans, onCreateOrg, onDeleteOrg,
}: SubscriptionsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowCreateOrg((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
          <Plus size={16} />
          {showCreateOrg ? "סגור טופס" : "מנוי / ארגון חדש"}
        </button>
      </div>

      {showCreateOrg ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <h3 className="mb-3 text-sm font-black">יצירת ארגון + מנהל ראשון</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="אימייל מנהל *" className={osFieldInlineClassName} />
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="שם מלא" className={osFieldInlineClassName} />
            <input value={createOrgName} onChange={(e) => setCreateOrgName(e.target.value)} placeholder="שם ארגון *" className={`${osFieldInlineClassName} sm:col-span-2`} />
            <select value={createTier} onChange={(e) => setCreateTier(e.target.value)} disabled={createVip} className={osFieldInlineClassName}>
              {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((t) => <option key={t} value={t}>{tierLabelHe(t)}</option>)}
            </select>
            <select value={createIndustry} onChange={(e) => {
              const next = normalizeIndustryType(e.target.value);
              setCreateIndustry(next);
              setCreateConstructionTrade(next === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
            }} className={osFieldInlineClassName}>
              <option value="CONSTRUCTION">בנייה / קבלנות</option>
              <option value="COMPANY_MGMT">ניהול עסק / חברה</option>
            </select>
            <select value={createConstructionTrade} onChange={(e) => setCreateConstructionTrade(e.target.value)} className={osFieldInlineClassName}>
              {createIndustry === "COMPANY_MGMT"
                ? BUSINESS_LINE_IDS.map((id) => <option key={id} value={id}>{businessLineLabelHe(id)}</option>)
                : CONSTRUCTION_TRADE_IDS.map((id) => <option key={id} value={id}>{constructionTradeLabelHe(id)}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={createVip} onChange={(e) => setCreateVip(e.target.checked)} />
              VIP (ללא הגבלת סריקות)
            </label>
          </div>
          <button type="button" disabled={busyAction} onClick={onCreateOrg}
            className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busyAction ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            צור מנוי
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-[color:var(--border-main)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface-soft)] text-[10px] uppercase tracking-widest text-[color:var(--foreground-muted)]">
              <tr>
                <th className="p-2 text-start">ארגון</th>
                <th className="p-2 text-start">אימייל</th>
                <th className="p-2 text-start">ענף</th>
                <th className="p-2 text-start">התמחות</th>
                <th className="p-2 text-start">מנוי</th>
                <th className="p-2 text-start">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}
                  className={`cursor-pointer border-t border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)] ${selectedOrgId === o.id ? "bg-blue-500/10" : ""}`}
                  onClick={() => setSelectedOrgId(o.id)}>
                  <td className="p-2 font-semibold">{o.name}</td>
                  <td className="p-2 text-xs text-[color:var(--foreground-muted)]">{o.primaryEmail ?? "—"}</td>
                  <td className="p-2 text-xs">{industryLabelHe(o.industry)}</td>
                  <td className="p-2 text-xs">
                    {normalizeIndustryType(o.industry) === "COMPANY_MGMT"
                      ? businessLineLabelHe((o.constructionTrade ?? "GENERAL_BUSINESS") as (typeof BUSINESS_LINE_IDS)[number])
                      : constructionTradeLabelHe((o.constructionTrade ?? "GENERAL_CONTRACTOR") as (typeof CONSTRUCTION_TRADE_IDS)[number])}
                  </td>
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
              <label className="block text-xs font-bold">ענף</label>
              <select value={editIndustry} onChange={(e) => {
                const next = normalizeIndustryType(e.target.value);
                setEditIndustry(next);
                setEditConstructionTrade(next === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
              }} className={osFieldClassName}>
                <option value="CONSTRUCTION">בנייה / קבלנות</option>
                <option value="COMPANY_MGMT">ניהול עסק / חברה</option>
              </select>
              <label className="block text-xs font-bold">{editIndustry === "COMPANY_MGMT" ? "קו עסק" : "תת-תחום בנייה"}</label>
              <select value={editConstructionTrade} onChange={(e) => setEditConstructionTrade(e.target.value)} className={osFieldClassName}>
                {editIndustry === "COMPANY_MGMT"
                  ? BUSINESS_LINE_IDS.map((id) => <option key={id} value={id}>{businessLineLabelHe(id)}</option>)
                  : CONSTRUCTION_TRADE_IDS.map((id) => <option key={id} value={id}>{constructionTradeLabelHe(id)}</option>)}
              </select>
              <label className="block text-xs font-bold">רמת מנוי</label>
              <select value={editTier} onChange={(e) => setEditTier(e.target.value)} className={osFieldClassName}>
                {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((t) => <option key={t} value={t}>{tierLabelHe(t)}</option>)}
              </select>
              <label className="block text-xs font-bold">סטטוס</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={osFieldClassName}>
                {["ACTIVE", "INACTIVE", "PENDING_APPROVAL", "TRIAL"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={onSaveSubscription}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white">
                <Save size={16} /> שמור מנוי
              </button>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <input type="number" placeholder="Δ זולות" value={cheapDelta || ""}
                  onChange={(e) => setCheapDelta(Number(e.target.value) || 0)}
                  className="rounded-lg border border-[color:var(--border-main)] p-2 text-sm" />
                <input type="number" placeholder="Δ פרימיום" value={premiumDelta || ""}
                  onChange={(e) => setPremiumDelta(Number(e.target.value) || 0)}
                  className="rounded-lg border border-[color:var(--border-main)] p-2 text-sm" />
              </div>
              <button type="button" onClick={onAdjustScans}
                className="w-full rounded-xl border border-[color:var(--border-main)] py-2 text-sm font-bold">
                עדכן יתרות סריקה
              </button>
              <div className="mt-4 border-t border-rose-500/30 pt-4">
                <p className="mb-2 text-xs font-bold text-rose-600">מחיקת ארגון (בלתי הפיך)</p>
                <input value={deleteOrgConfirm} onChange={(e) => setDeleteOrgConfirm(e.target.value)}
                  placeholder={`הקלידו «${selectedOrg.name}» לאישור`}
                  className="mb-2 w-full rounded-lg border border-rose-500/40 p-2 text-sm" />
                <button type="button" disabled={busyAction || deleteOrgConfirm.trim() !== selectedOrg.name}
                  onClick={onDeleteOrg}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/10 py-2 text-sm font-bold text-rose-600 disabled:opacity-40">
                  <Trash2 size={16} /> מחק ארגון
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--foreground-muted)]">בחרו ארגון מהטבלה לעריכה</p>
          )}
        </aside>
      </div>
    </div>
  );
}
