"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Send } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
import type { ProgressBillPortalRow } from "@/lib/validation/schemas/progress-bill-portal";

type ProjectOption = { id: string; name: string };

const STATUS_LABEL_KEYS: Record<ProgressBillPortalRow["status"], string> = {
  DRAFT: "workspaceWidgets.progressBills.status.draft",
  SUBMITTED: "workspaceWidgets.progressBills.status.submitted",
  APPROVED: "workspaceWidgets.progressBills.status.approved",
  PAID: "workspaceWidgets.progressBills.status.paid",
};

export default function ProgressBillPortalPanel() {
  const { t } = useI18n();
  const [bills, setBills] = useState<ProgressBillPortalRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [amount, setAmount] = useState("");
  const [completionPercent, setCompletionPercent] = useState("");

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/progress-bills", { credentials: "include" });
      const data = (await res.json()) as { bills?: ProgressBillPortalRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("workspaceWidgets.progressBills.loadError"));
      setBills(Array.isArray(data.bills) ? data.bills : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.progressBills.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const data = (await res.json()) as { projects?: ProjectOption[] };
      const list = Array.isArray(data.projects) ? data.projects : [];
      setProjects(list);
      if (!projectId && list[0]) setProjectId(list[0].id);
    } catch {
      setProjects([]);
    }
  }, [projectId]);

  useEffect(() => {
    void loadBills();
    void loadProjects();
  }, [loadBills, loadProjects]);

  const handleCreate = async (submit: boolean) => {
    const parsedAmount = Number(amount);
    const parsedPercent = Number(completionPercent);
    if (!projectId || !contractorName.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
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
          amount: parsedAmount,
          completionPercent: parsedPercent,
          submit,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("workspaceWidgets.progressBills.createError"));
      setContractorName("");
      setAmount("");
      setCompletionPercent("");
      await loadBills();
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
      await loadBills();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.progressBills.actionError"));
    } finally {
      setActingId(null);
    }
  };

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(num);

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
              className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-2 text-sm"
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
