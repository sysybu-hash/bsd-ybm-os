"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Receipt, Loader2, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";

type IssuedDoc = {
  id: string;
  type: string;
  number: number;
  date: string;
  clientName: string;
  total: number;
  status: string;
};

type ExpenseRow = {
  id: string;
  vendorName: string;
  expenseDate: string;
  total: number;
};

type ExportFormat = { id: string; label: string };

function firstOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function ils(n: number): string {
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
}

export default function AccountantPortalClient({ orgName }: { orgName: string }) {
  const { t, dir } = useI18n();
  const [docs, setDocs] = useState<IssuedDoc[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [format, setFormat] = useState("bkmvdata");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setFromDate(firstOfMonthIso());
    setToDate(todayIso());
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, expRes, fmtRes] = await Promise.all([
        fetch("/api/erp/issued-documents", { credentials: "include" }),
        fetch("/api/office-expenses", { credentials: "include" }),
        fetch("/api/accounting/export", { credentials: "include" }),
      ]);
      if (docsRes.ok) {
        const data = (await docsRes.json()) as { documents?: IssuedDoc[] };
        setDocs(Array.isArray(data.documents) ? data.documents : []);
      }
      if (expRes.ok) {
        const data = (await expRes.json()) as { expenses?: ExpenseRow[] } | ExpenseRow[];
        const rows = Array.isArray(data) ? data : (data.expenses ?? []);
        setExpenses(rows);
      }
      if (fmtRes.ok) {
        const data = (await fmtRes.json()) as { formats?: ExportFormat[] };
        if (Array.isArray(data.formats) && data.formats.length) {
          setFormats(data.formats);
          setFormat(data.formats[0]!.id);
        }
      }
    } catch {
      toast.error(t("accountantPortal.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const runExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/accounting/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          fromDate: new Date(fromDate).toISOString(),
          toDate: new Date(`${toDate}T23:59:59`).toISOString(),
          includeDocuments: true,
          includeExpenses: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("accountantPortal.exportFailed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `accounting-${format}-${fromDate}_${toDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("accountantPortal.exportSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("accountantPortal.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [format, fromDate, toDate, t]);

  const fmtOptions = formats.length
    ? formats
    : [{ id: "bkmvdata", label: t("accountantPortal.defaultFormat") }];

  return (
    <div dir={dir} className="mx-auto min-h-screen max-w-5xl px-4 py-6 text-[color:var(--foreground-main)]">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">{t("accountantPortal.title")}</h1>
          <p className="text-sm text-[color:var(--foreground-muted)]">
            {orgName ? `${orgName} · ` : ""}{t("accountantPortal.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
        >
          <LogOut size={14} aria-hidden />
          {t("accountantPortal.signOut")}
        </button>
      </header>

      <section className="mb-6 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Download size={16} className="text-emerald-500" aria-hidden />
          {t("accountantPortal.exportSection")}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--foreground-muted)]">
            {t("accountantPortal.fromDate")}
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--foreground-muted)]">
            {t("accountantPortal.toDate")}
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--foreground-muted)]">
            {t("accountantPortal.format")}
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-sm"
            >
              {fmtOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
            {t("accountantPortal.exportButton")}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-[color:var(--accent)]" size={24} />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <FileText size={16} className="text-[color:var(--accent)]" aria-hidden />
              {t("accountantPortal.documentsTitle")} ({docs.length})
            </h2>
            <div className="max-h-[50vh] overflow-y-auto">
              {docs.length === 0 ? (
                <p className="py-6 text-center text-xs text-[color:var(--foreground-muted)]">{t("accountantPortal.noDocuments")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {docs.slice(0, 100).map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)]/60 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-bold">#{d.number}</span> · {d.clientName}
                      </span>
                      <span className="shrink-0 font-semibold">{ils(d.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Receipt size={16} className="text-amber-500" aria-hidden />
              {t("accountantPortal.expensesTitle")} ({expenses.length})
            </h2>
            <div className="max-h-[50vh] overflow-y-auto">
              {expenses.length === 0 ? (
                <p className="py-6 text-center text-xs text-[color:var(--foreground-muted)]">{t("accountantPortal.noExpenses")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {expenses.slice(0, 100).map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)]/60 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">{e.vendorName}</span>
                      <span className="shrink-0 font-semibold">{ils(e.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
