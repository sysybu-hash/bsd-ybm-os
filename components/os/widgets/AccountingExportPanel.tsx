"use client";

import React, { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Format = "bkmvdata" | "priority" | "hashavshevet";

export default function AccountingExportPanel() {
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
        toast.error(j.error ?? "שגיאה בייצוא");
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
      toast.success("קובץ ייצוא הורד");
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  };

  const labels: Record<Format, string> = {
    bkmvdata: "מבנה אחיד (מע״מ)",
    priority: "Priority (CSV)",
    hashavshevet: "חשבשבת (CSV)",
  };

  return (
    <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 space-y-2">
      <p className="text-xs font-bold">ייצוא לחשבונאות (ישראל)</p>
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
      <button
        type="button"
        disabled={loading}
        onClick={() => void download()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-700 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        הורד ייצוא (חודש אחרון)
      </button>
    </div>
  );
}
