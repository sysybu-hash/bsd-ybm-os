"use client";

import React from "react";
import { Building2, Save, Trash2 } from "lucide-react";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import { ADMIN_SUBSCRIPTION_TIER_OPTIONS, tierLabelHe } from "@/lib/subscription-tier-config";
import { normalizeIndustryType, industryLabelHe } from "@/lib/professions/config";
import { osFieldClassName } from "@/components/os/ui/os-field";

const ORG_STATUSES = ["ACTIVE", "INACTIVE", "PENDING_APPROVAL", "TRIAL"] as const;

type OrgEditorPanelProps = {
  org: ExecutiveOrgRow;
  /** Trade / business-line options for the currently selected industry. */
  specialtyOptions: Array<{ id: string; label: string }>;
  editTier: string; setEditTier: (v: string) => void;
  editStatus: string; setEditStatus: (v: string) => void;
  editIndustry: string; onIndustryChange: (v: string) => void;
  editConstructionTrade: string; setEditConstructionTrade: (v: string) => void;
  cheapDelta: number; setCheapDelta: (v: number) => void;
  premiumDelta: number; setPremiumDelta: (v: number) => void;
  deleteOrgConfirm: string; setDeleteOrgConfirm: (v: string) => void;
  busyAction: boolean;
  onSaveSubscription: () => void;
  onAdjustScans: () => void;
  onDeleteOrg: () => void;
  /** Scoped translator — receives a key under `platformAdmin.orgs`. */
  t: (suffix: string, params?: Record<string, string>) => string;
};

export function OrgEditorPanel({
  org, specialtyOptions,
  editTier, setEditTier, editStatus, setEditStatus,
  editIndustry, onIndustryChange, editConstructionTrade, setEditConstructionTrade,
  cheapDelta, setCheapDelta, premiumDelta, setPremiumDelta,
  deleteOrgConfirm, setDeleteOrgConfirm,
  busyAction, onSaveSubscription, onAdjustScans, onDeleteOrg, t,
}: OrgEditorPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 size={16} aria-hidden />
        <h3 className="font-black">{org.name}</h3>
      </div>
      <p className="text-xs text-[color:var(--foreground-muted)]">
        {t("scansLine", {
          cheap: String(org.cheapScansRemaining),
          premium: String(org.premiumScansRemaining),
        })}
      </p>

      <label className="block text-xs font-bold">
        {t("industryLabel")}
        <select
          value={editIndustry}
          onChange={(e) => onIndustryChange(e.target.value)}
          className={`${osFieldClassName} mt-1 font-normal`}
        >
          <option value="CONSTRUCTION">{industryLabelHe("CONSTRUCTION")}</option>
          <option value="COMPANY_MGMT">{industryLabelHe("COMPANY_MGMT")}</option>
        </select>
      </label>

      <label className="block text-xs font-bold">
        {normalizeIndustryType(editIndustry) === "COMPANY_MGMT"
          ? t("specialtyBusiness")
          : t("specialtyConstruction")}
        <select
          value={editConstructionTrade}
          onChange={(e) => setEditConstructionTrade(e.target.value)}
          className={`${osFieldClassName} mt-1 font-normal`}
        >
          {specialtyOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-bold">
        {t("tierLabel")}
        <select
          value={editTier}
          onChange={(e) => setEditTier(e.target.value)}
          className={`${osFieldClassName} mt-1 font-normal`}
        >
          {ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((tier) => (
            <option key={tier} value={tier}>{tierLabelHe(tier)}</option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-bold">
        {t("statusLabel")}
        <select
          value={editStatus}
          onChange={(e) => setEditStatus(e.target.value)}
          className={`${osFieldClassName} mt-1 font-normal`}
        >
          {ORG_STATUSES.map((s) => (
            <option key={s} value={s}>{t(`status${s}`)}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onSaveSubscription}
        disabled={busyAction}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        <Save size={16} aria-hidden /> {t("saveSubscription")}
      </button>

      <div className="rounded-xl border border-[color:var(--border-main)] p-3">
        <p className="mb-2 text-xs font-bold">{t("adjustTitle")}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-[color:var(--foreground-muted)]">
            {t("cheapDelta")}
            <input
              type="number"
              value={cheapDelta || ""}
              onChange={(e) => setCheapDelta(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-2 text-sm font-normal"
            />
          </label>
          <label className="text-[11px] font-bold text-[color:var(--foreground-muted)]">
            {t("premiumDelta")}
            <input
              type="number"
              value={premiumDelta || ""}
              onChange={(e) => setPremiumDelta(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-2 text-sm font-normal"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onAdjustScans}
          disabled={busyAction || (cheapDelta === 0 && premiumDelta === 0)}
          className="mt-2 w-full rounded-xl border border-[color:var(--border-main)] py-2 text-sm font-bold disabled:opacity-40"
        >
          {t("adjustScans")}
        </button>
      </div>

      <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
        <p className="mb-2 text-xs font-bold text-rose-600">{t("dangerTitle")}</p>
        <input
          value={deleteOrgConfirm}
          onChange={(e) => setDeleteOrgConfirm(e.target.value)}
          placeholder={t("deleteConfirmPlaceholder", { name: org.name })}
          className="mb-2 w-full rounded-lg border border-rose-500/40 bg-[color:var(--background-main)] p-2 text-sm"
        />
        <button
          type="button"
          disabled={busyAction || deleteOrgConfirm.trim() !== org.name}
          onClick={onDeleteOrg}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/10 py-2 text-sm font-bold text-rose-600 disabled:opacity-40"
        >
          <Trash2 size={16} aria-hidden /> {t("deleteOrg")}
        </button>
      </div>
    </div>
  );
}
