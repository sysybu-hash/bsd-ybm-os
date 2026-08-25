"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Send } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
import type { BoqOption, ProgressBillPortalRow, ProjectOption } from "./types";
import { useProgressBillPortalData } from "./useProgressBillPortalData";

const STATUS_LABEL_KEYS: Record<ProgressBillPortalRow["status"], string> = {
  DRAFT: "workspaceWidgets.progressBills.status.draft",
  SUBMITTED: "workspaceWidgets.progressBills.status.submitted",
  APPROVED: "workspaceWidgets.progressBills.status.approved",
  PAID: "workspaceWidgets.progressBills.status.paid",
};

export default function ProgressBillPortalPanel() {
  const { t, locale } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [contractorName, setContractorName] = useState("");
  const [amount, setAmount] = useState("");
  const [completionPercent, setCompletionPercent] = useState("");

  const numberLocale = locale === "he" ? "he-IL" : locale === "ru" ? "ru-RU" : "en-GB";

  const {
    bills,
    projects,
    boqLines,
    selected,
    setSelected,
    projectId,
    setProjectId,
    loading,
    error,
    setError,
    reloadBills,
  } = useProgressBillPortalData({ t });

  const selectedLines = useMemo(
    () =>
      boqLines
        .map((l) => {
          const raw = selected[l.id];
          if (raw == null || raw === "") return null;
          const executedQty = Number(raw);
          if (!Number.isFinite(executedQty) || executedQty < 0) return null;
          if (executedQty === 0 && !(l.id in selected && selected[l.id] === "0")) return null;
          return { boqLineId: l.id, executedQty, unitPrice: l.unitPrice ?? 0, description: l.description };
        })
        .filter((x): x is NonNullable<typeof x> => x != null && x.executedQty > 0),
    [boqLines, selected],
  );

  const linesTotal = selectedLines.reduce((s, l) => s + l.executedQty * l.unitPrice, 0);

  const handleCreate = async (submit: boolean) => {
    const parsedPercent = Number(completionPercent);
    const parsedAmount = Number(amount);
    const useLines = selectedLines.length > 0;
    if (!projectId || !contractorName.trim()) {
      setError(t("workspaceWidgets.progressBills.validation"));
      return;
    }
    if (!useLines && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setError(t("workspaceWidgets.progressBills.validation"));
      return;
    }
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      setError(t("workspaceWidgets.progressBills.validation"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/progress-bills", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          contractorName: contractorName.trim(),
          amount: useLines ? undefined : parsedAmount,
          completionPercent: parsedPercent,
          submit,
          lines: useLines
            ? selectedLines.map((l) => ({
                boqLineId: l.boqLineId,
                executedQty: l.executedQty,
              }))
            : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("workspaceWidgets.progressBills.createError"));
      setContractorName("");
      setAmount("");
      setCompletionPercent("");
      await reloadBills();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.progressBills.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (billId: string, action: "submit" | "approve" | "pay") => {
    setActingId(billId);
    setError(null);
    try {
      const res = await fetch(`/api/progress-bills/${billId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("workspaceWidgets.progressBills.actionError"));
      await reloadBills();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.progressBills.actionError"));
    } finally {
      setActingId(null);
    }
  };

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat(numberLocale, { style: "currency", currency: "ILS" }).format(num);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 md:p-5">
          <h3 className="mb-3 text-sm font-bold text-[color:var(--foreground-main)]">
            {t("workspaceWidgets.progressBills.submitTitle")}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-2 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={contractorName}
              onChange={(e) => setContractorName(e.target.value)}
              placeholder={t("workspaceWidgets.progressBills.contractorPlaceholder")}
              className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-2 text-sm"
            />
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("workspaceWidgets.progressBills.amountPlaceholder")}
              disabled={selectedLines.length > 0}
              className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-2 text-sm disabled:opacity-50"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={completionPercent}
              onChange={(e) => setCompletionPercent(e.target.value)}
              placeholder={t("workspaceWidgets.progressBills.percentPlaceholder")}
              className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-2 text-sm"
            />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-bold text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.progressBills.boqLinesTitle")}
            </p>
            {boqLines.length === 0 ? (
              <p className="text-xs text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.progressBills.boqLinesEmpty")}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[color:var(--border-main)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[color:var(--surface-elevated)] text-[color:var(--foreground-muted)]">
                      <th className="p-2 text-start">{t("workspaceWidgets.progressBills.colDescription")}</th>
                      <th className="p-2">{t("workspaceWidgets.progressBills.colContractQty")}</th>
                      <th className="p-2">{t("workspaceWidgets.progressBills.colExecutedQty")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boqLines.map((l) => (
                      <tr key={l.id} className="border-t border-[color:var(--border-main)]/40">
                        <td className="p-2 text-start">{l.description}</td>
                        <td className="p-2 text-center">{l.quantity ?? "—"}</td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={selected[l.id] ?? ""}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }
                            className="w-20 rounded border border-[color:var(--border-main)] bg-transparent px-1 text-center"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selectedLines.length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-[color:var(--foreground-main)]">
                {t("workspaceWidgets.progressBills.linesTotal").replace(
                  "{amount}",
                  formatCurrency(linesTotal),
                )}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <OsButton variant="secondary" size="sm" disabled={submitting} onClick={() => void handleCreate(false)}>
              {t("workspaceWidgets.progressBills.saveDraft")}
            </OsButton>
            <OsButton
              variant="primary"
              size="sm"
              loading={submitting}
              icon={<Send size={14} aria-hidden />}
              onClick={() => void handleCreate(true)}
            >
              {t("workspaceWidgets.progressBills.submit")}
            </OsButton>
          </div>
        </section>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <section>
          <h3 className="mb-3 text-sm font-bold text-[color:var(--foreground-main)]">
            {t("workspaceWidgets.progressBills.listTitle")}
          </h3>
          {loading ? (
            <WidgetState variant="loading" message={t("workspaceWidgets.progressBills.loading")} />
          ) : bills.length === 0 ? (
            <p className="text-sm text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.progressBills.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {bills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex flex-col gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[color:var(--foreground-main)]">
                      {bill.projectName} · #{bill.billNumber}
                    </p>
                    <p className="text-sm text-[color:var(--foreground-muted)]">
                      {bill.contractorName ?? "—"} · {formatCurrency(bill.amount)}
                      {bill.completionPercent != null
                        ? ` · ${bill.completionPercent}%`
                        : ""}
                      {bill.lines && bill.lines.length > 0
                        ? ` · ${t("workspaceWidgets.progressBills.lineCount").replace("{n}", String(bill.lines.length))}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                      {t(STATUS_LABEL_KEYS[bill.status])}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bill.status === "DRAFT" ? (
                      <OsButton
                        variant="secondary"
                        size="sm"
                        loading={actingId === bill.id}
                        onClick={() => void handleAction(bill.id, "submit")}
                      >
                        {t("workspaceWidgets.progressBills.submit")}
                      </OsButton>
                    ) : null}
                    {bill.status === "SUBMITTED" ? (
                      <OsButton
                        variant="primary"
                        size="sm"
                        loading={actingId === bill.id}
                        icon={<Check size={14} aria-hidden />}
                        onClick={() => void handleAction(bill.id, "approve")}
                      >
                        {t("workspaceWidgets.progressBills.approve")}
                      </OsButton>
                    ) : null}
                    {bill.status === "APPROVED" ? (
                      <OsButton
                        variant="secondary"
                        size="sm"
                        loading={actingId === bill.id}
                        onClick={() => void handleAction(bill.id, "pay")}
                      >
                        {t("workspaceWidgets.progressBills.markPaid")}
                      </OsButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
