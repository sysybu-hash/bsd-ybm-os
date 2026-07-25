"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Plus, Search, UserPlus } from "lucide-react";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import { ADMIN_SUBSCRIPTION_TIER_OPTIONS, tierLabelHe } from "@/lib/subscription-tier-config";
import { BUSINESS_LINE_IDS, businessLineLabelHe } from "@/lib/business-lines";
import { CONSTRUCTION_TRADE_IDS, constructionTradeLabelHe } from "@/lib/construction-trades";
import { normalizeIndustryType, industryLabelHe } from "@/lib/professions/config";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldInlineClassName } from "@/components/os/ui/os-field";
import { OrgEditorPanel } from "@/components/admin/platform-admin/OrgEditorPanel";

/** Trade/business-line options for the currently selected industry. */
function specialtyOptions(industry: string) {
  return normalizeIndustryType(industry) === "COMPANY_MGMT"
    ? BUSINESS_LINE_IDS.map((id) => ({ id: id as string, label: businessLineLabelHe(id) }))
    : CONSTRUCTION_TRADE_IDS.map((id) => ({ id: id as string, label: constructionTradeLabelHe(id) }));
}

function specialtyLabel(org: ExecutiveOrgRow) {
  return normalizeIndustryType(org.industry) === "COMPANY_MGMT"
    ? businessLineLabelHe((org.constructionTrade ?? "GENERAL_BUSINESS") as (typeof BUSINESS_LINE_IDS)[number])
    : constructionTradeLabelHe((org.constructionTrade ?? "GENERAL_CONTRACTOR") as (typeof CONSTRUCTION_TRADE_IDS)[number]);
}

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
  onSaveSubscription: () => void;
  onAdjustScans: () => void;
  onCreateOrg: () => void;
  onDeleteOrg: () => void;
};

export function SubscriptionsTab(props: SubscriptionsTabProps) {
  const {
    orgs, selectedOrgId, setSelectedOrgId, selectedOrg,
    editTier, setEditTier, editStatus, setEditStatus,
    editIndustry, setEditIndustry, editConstructionTrade, setEditConstructionTrade,
    cheapDelta, setCheapDelta, premiumDelta, setPremiumDelta,
    deleteOrgConfirm, setDeleteOrgConfirm, showCreateOrg, setShowCreateOrg,
    createEmail, setCreateEmail, createName, setCreateName,
    createOrgName, setCreateOrgName, createTier, setCreateTier,
    createVip, setCreateVip, createIndustry, setCreateIndustry,
    createConstructionTrade, setCreateConstructionTrade,
    busyAction, onSaveSubscription, onAdjustScans, onCreateOrg, onDeleteOrg,
  } = props;

  const { t } = useI18n();
  const ts = (suffix: string, params?: Record<string, string>) =>
    t(`platformAdmin.orgs.${suffix}`, params);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) =>
      [o.name, o.primaryEmail ?? "", industryLabelHe(o.industry), specialtyLabel(o)]
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [orgs, filter]);

  const canCreate = createEmail.trim() !== "" && createOrgName.trim() !== "";

  return (
    <div className="space-y-4" dir="auto">
      <button
        type="button"
        onClick={() => setShowCreateOrg((v) => !v)}
        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
      >
        <Plus size={16} aria-hidden />
        {showCreateOrg ? ts("closeForm") : ts("newOrg")}
      </button>

      {showCreateOrg ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <h3 className="mb-3 text-sm font-black">{ts("createTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
              placeholder={ts("adminEmail")} className={osFieldInlineClassName} />
            <input value={createName} onChange={(e) => setCreateName(e.target.value)}
              placeholder={ts("fullName")} className={osFieldInlineClassName} />
            <input value={createOrgName} onChange={(e) => setCreateOrgName(e.target.value)}
              placeholder={ts("orgName")} className={`${osFieldInlineClassName} sm:col-span-2`} />
            <select value={createTier} onChange={(e) => setCreateTier(e.target.value)}
              disabled={createVip} className={osFieldInlineClassName}>
              {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((tier) => (
                <option key={tier} value={tier}>{tierLabelHe(tier)}</option>
              ))}
            </select>
            <select
              value={createIndustry}
              onChange={(e) => {
                const next = normalizeIndustryType(e.target.value);
                setCreateIndustry(next);
                setCreateConstructionTrade(next === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
              }}
              className={osFieldInlineClassName}
            >
              <option value="CONSTRUCTION">{industryLabelHe("CONSTRUCTION")}</option>
              <option value="COMPANY_MGMT">{industryLabelHe("COMPANY_MGMT")}</option>
            </select>
            <select value={createConstructionTrade} onChange={(e) => setCreateConstructionTrade(e.target.value)}
              className={osFieldInlineClassName}>
              {specialtyOptions(createIndustry).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600"
                checked={createVip} onChange={(e) => setCreateVip(e.target.checked)} />
              {ts("vip")}
            </label>
          </div>
          <button type="button" disabled={busyAction || !canCreate} onClick={onCreateOrg}
            className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busyAction ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <UserPlus size={16} aria-hidden />}
            {ts("createButton")}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative min-w-[200px] flex-1">
              <Search size={14} aria-hidden
                className="pointer-events-none absolute inset-y-0 my-auto start-3 text-[color:var(--foreground-muted)]" />
              <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder={ts("filterPlaceholder")}
                className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] py-2 pe-3 ps-9 text-sm" />
            </span>
            <span className="text-xs font-bold text-[color:var(--foreground-muted)]">
              {ts("countLabel", { shown: String(visible.length), total: String(orgs.length) })}
            </span>
          </div>

          {orgs.length === 0 || visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[color:var(--border-main)] p-6 text-center text-sm text-[color:var(--foreground-muted)]">
              {orgs.length === 0 ? ts("empty") : ts("noMatches")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface-soft)] text-[10px] uppercase tracking-widest text-[color:var(--foreground-muted)]">
                  <tr>
                    <th className="p-2 text-start">{ts("colOrg")}</th>
                    <th className="p-2 text-start">{ts("colEmail")}</th>
                    <th className="p-2 text-start">{ts("colIndustry")}</th>
                    <th className="p-2 text-start">{ts("colSpecialty")}</th>
                    <th className="p-2 text-start">{ts("colTier")}</th>
                    <th className="p-2 text-start">{ts("colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o) => {
                    const selected = selectedOrgId === o.id;
                    return (
                      <tr
                        key={o.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedOrgId(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedOrgId(o.id);
                          }
                        }}
                        className={`cursor-pointer border-t border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          selected ? "bg-blue-500/10" : ""
                        }`}
                      >
                        <td className="p-2 font-semibold">{o.name}</td>
                        <td className="p-2 text-xs text-[color:var(--foreground-muted)]">{o.primaryEmail ?? "—"}</td>
                        <td className="p-2 text-xs">{industryLabelHe(o.industry)}</td>
                        <td className="p-2 text-xs">{specialtyLabel(o)}</td>
                        <td className="p-2">{tierLabelHe(o.subscriptionTier)}</td>
                        <td className="p-2 text-xs">
                          {t(`platformAdmin.orgs.status${o.subscriptionStatus}`)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-[color:var(--border-main)] p-4">
          {selectedOrg ? (
            <OrgEditorPanel
              org={selectedOrg}
              specialtyOptions={specialtyOptions(editIndustry)}
              editTier={editTier} setEditTier={setEditTier}
              editStatus={editStatus} setEditStatus={setEditStatus}
              editIndustry={editIndustry}
              onIndustryChange={(v) => {
                const next = normalizeIndustryType(v);
                setEditIndustry(next);
                setEditConstructionTrade(next === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
              }}
              editConstructionTrade={editConstructionTrade}
              setEditConstructionTrade={setEditConstructionTrade}
              cheapDelta={cheapDelta} setCheapDelta={setCheapDelta}
              premiumDelta={premiumDelta} setPremiumDelta={setPremiumDelta}
              deleteOrgConfirm={deleteOrgConfirm} setDeleteOrgConfirm={setDeleteOrgConfirm}
              busyAction={busyAction}
              onSaveSubscription={onSaveSubscription}
              onAdjustScans={onAdjustScans}
              onDeleteOrg={onDeleteOrg}
              t={ts}
            />
          ) : (
            <p className="p-4 text-center text-sm text-[color:var(--foreground-muted)]">
              {ts("selectPrompt")}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
