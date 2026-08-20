"use client";

import React, { useEffect, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { OsButton } from "@/components/os/ui";

type Format = "bkmvdata" | "priority" | "hashavshevet";

export default function AccountingExportPanel() {
  const { t } = useI18n();

  const [formats, setFormats] = useState<Format[]>([]);
  const [format, setFormat] = useState<Format>("bkmvdata");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/accounting/export", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { formats?: string[] }) => {
        const list = (j.formats ?? []).filter((f): f is Format =>
          f === "bkmvdata" || f === "priority" || f === "hashavshevet",
        );
        setFormats(list.length ? list : ["bkmvdata", "priority", "hashavshevet"]);
      })
      .catch(() => setFormats(["bkmvdata", "priority", "hashavshevet"]));
  }, []);

  const download = async () => {
    setLoading(true);
    try {
      const to = new Date();
      const from = new Date(to);
      from.setMonth(from.getMonth() - 1);
      const res = await fetch("/api/accounting/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          fromDate: from.toISOString(),
          toDate: to.toISOString(),
          includeDocuments: true,
          includeExpenses: true,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        toast.error(j.error ?? t("workspaceWidgets.accountingExport.exportError"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match?.[1] ?? `export.${format === "bkmvdata" ? "txt" : "csv"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("workspaceWidgets.accountingExport.downloaded"));
    } catch {
      toast.error(t("workspaceWidgets.accountingExport.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const labels: Record<Format, string> = {
    bkmvdata: t("workspaceWidgets.accountingExport.formatBkmvdata"),
    priority: "Priority (CSV)",
    hashavshevet: t("workspaceWidgets.accountingExport.formatHashavshevet"),
  };

  return (
    <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 space-y-2">
      <p className="text-xs font-bold">{t("workspaceWidgets.accountingExport.title")}</p>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as Format)}
        className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-xs"
      >
        {(formats.length ? formats : (["bkmvdata", "priority", "hashavshevet"] as Format[])).map((f) => (
          <option key={f} value={f}>
            {labels[f]}
          </option>
        ))}
      </select>
      <OsButton
        variant="primary"
        className="w-full justify-center"
        loading={loading}
        icon={<Download size={14} aria-hidden />}
        onClick={() => void download()}
      >
        {t("workspaceWidgets.accountingExport.download")}
      </OsButton>
    </div>
  );
}
