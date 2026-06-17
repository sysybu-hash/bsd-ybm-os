"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { LogisticsAssetRow } from "./types";
import { useLogisticsLookups } from "./useLogisticsData";

const prefix = "workspaceWidgets.logistics.assets";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";
const labelClass = "mb-1 block text-sm font-medium text-[color:var(--foreground-muted)]";

type Props = {
  asset: LogisticsAssetRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function AssetCheckoutPanel({ asset, open, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const lookups = useLogisticsLookups(open);
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUserId("");
      setProjectId("");
      setNotes("");
      setError(null);
    }
  }, [open, asset?.id]);

  const handleSubmit = async () => {
    if (!asset) return;
    if (!userId) {
      setError(t(`${prefix}.userRequired`));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/logistics/assets/${asset.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CHECK_OUT",
          userId,
          projectId: projectId || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } catch {
      setError(t(`${prefix}.actionFailed`));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t(`${prefix}.checkoutTitle`, { name: asset?.name ?? "" })}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[color:var(--border-main)] px-4 py-2 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t(`${prefix}.confirmCheckout`)}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-1">
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t(`${prefix}.checkoutDesc`)}
        </p>
        <div>
          <label className={labelClass}>{t(`${prefix}.assignee`)}</label>
          <select
            className={inputClass}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">{t(`${prefix}.selectUser`)}</option>
            {(lookups?.users ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t(`${prefix}.project`)}</label>
          <select
            className={inputClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{t(`${prefix}.selectProjectOptional`)}</option>
            {(lookups?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t(`${prefix}.notes`)}</label>
          <textarea
            rows={3}
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </OsFloatingPanel>
  );
}
