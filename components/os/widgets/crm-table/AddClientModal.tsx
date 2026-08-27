"use client";

import React, { useState } from "react";
import { UserPlus, X, User, Mail, Phone, Save, Banknote } from "lucide-react";
import { toast } from "sonner";
import type {} from "./types";
import type { CrmPipelineStatus } from "@/lib/crm/pipeline-status";
import { CrmOverlayPortal } from "./CrmOverlayPortal";
import { OsButton, OsIconButton } from "@/components/os/ui";
import { pipelineStatusOptions } from "./constants";

type AddClientModalProps = {
  onClose: () => void;
  onCreated: () => void;
  t: (key: string) => string;
};

const FIELD_CLS =
  "w-full bg-[color:var(--surface-soft)] border border-[color:var(--border-main)] rounded-xl pe-10 ps-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--win-accent,var(--accent))]/50 text-[color:var(--foreground-main)]";

export function AddClientModal({ onClose, onCreated, t }: AddClientModalProps) {
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    status: CrmPipelineStatus;
    value: string;
  }>({ name: "", email: "", phone: "", status: "LEAD", value: "" });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.name || !form.email) {
      toast.error(t("workspaceWidgets.crmTable.nameEmailRequired"));
      return;
    }
    const parsedValue = form.value.trim() ? Number.parseFloat(form.value) : null;
    if (form.value.trim() && (parsedValue == null || Number.isNaN(parsedValue) || parsedValue < 0)) {
      toast.error(t("workspaceWidgets.crmTable.valueInvalid"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          status: form.status,
          value: parsedValue,
        }),
      });
      if (res.ok) {
        toast.success(t("workspaceWidgets.crmTable.created"));
        onClose();
        onCreated();
      } else {
        throw new Error("Failed to create client");
      }
    } catch {
      toast.error(t("workspaceWidgets.crmTable.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrmOverlayPortal>
      <div className="w-full max-w-md shrink-0 bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-[2.5rem] p-8 shadow-2xl my-auto">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-[color:var(--foreground-main)] flex items-center gap-3">
            <UserPlus className="text-[color:var(--accent)]" size={24} aria-hidden /> {t("workspaceWidgets.crmTable.addClientTitle")}
          </h3>
          <OsIconButton label={t("common.close")} onClick={onClose} size="sm">
            <X size={20} aria-hidden />
          </OsIconButton>
        </div>

        <div className="space-y-4 mb-8">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">{t("workspaceWidgets.crmTable.addClientName")}</label>
            <div className="relative">
              <User className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} aria-hidden />
              <input
                placeholder={t("workspaceWidgets.crmTable.addClientNamePlaceholder")}
                className={FIELD_CLS}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">{t("workspaceWidgets.crmTable.emailLabel")}</label>
            <div className="relative">
              <Mail className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} aria-hidden />
              <input
                type="email"
                placeholder="israel@example.com"
                className={FIELD_CLS}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">{t("workspaceWidgets.crmTable.phoneLabel")}</label>
            <div className="relative">
              <Phone className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} aria-hidden />
              <input
                placeholder="050-0000000"
                className={FIELD_CLS}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">{t("workspaceWidgets.crmTable.valueLabel")}</label>
            <div className="relative">
              <Banknote className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} aria-hidden />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                className={FIELD_CLS}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">{t("workspaceWidgets.crmTable.addClientStatus")}</label>
            <select
              className={`${FIELD_CLS} appearance-none`}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CrmPipelineStatus })}
            >
              {pipelineStatusOptions(t).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <OsButton
          variant="primary"
          onClick={() => void handleAdd()}
          loading={saving}
          icon={<Save size={18} aria-hidden />}
          className="w-full h-12 justify-center"
        >
          {t("workspaceWidgets.crmTable.addClientSave")}
        </OsButton>
      </div>
    </CrmOverlayPortal>
  );
}
