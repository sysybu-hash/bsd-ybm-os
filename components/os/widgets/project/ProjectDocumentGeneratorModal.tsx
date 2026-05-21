"use client";

import React, { useMemo } from "react";
import { FileOutput, X } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  getProjectSubDomainsForIndustry,
  type ProjectSubDomainId,
} from "@/lib/project-sub-domains";
import {
  buildDocumentCreatorLiveData,
  catalogForSubDomain,
  type BoqLinePrefill,
  type ProjectDocumentCatalogEntry,
} from "@/lib/project-document-catalog";

const COLOR_RING: Record<ProjectDocumentCatalogEntry["color"], string> = {
  indigo: "border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20",
  emerald: "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  amber: "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20",
  sky: "border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20",
  violet: "border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20",
  rose: "border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20",
  slate: "border-slate-400/40 bg-slate-500/10 hover:bg-slate-500/20",
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  contactId?: string | null;
  contactName?: string | null;
  initialDomain?: ProjectSubDomainId | "ALL";
  boqLines?: BoqLinePrefill[];
  title?: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  onOpenBoq?: () => void;
  onOpenDiary?: (opts?: { taskId?: string; description?: string }) => void;
  organizationIndustry?: string | null;
};

export default function ProjectDocumentGeneratorModal({
  open,
  onClose,
  projectId,
  projectName,
  contactId,
  contactName,
  initialDomain = "ALL",
  boqLines = [],
  title = "מחולל מסמכים",
  openWorkspaceWidget,
  onOpenBoq,
  onOpenDiary,
  organizationIndustry,
}: Props) {
  const [filterDomain, setFilterDomain] = React.useState<ProjectSubDomainId | "ALL">(initialDomain);
  const subDomains = useMemo(
    () => getProjectSubDomainsForIndustry(organizationIndustry),
    [organizationIndustry],
  );

  React.useEffect(() => {
    if (open) setFilterDomain(initialDomain);
  }, [open, initialDomain]);

  const grouped = useMemo(() => {
    const domain = filterDomain;
    const entries = catalogForSubDomain(domain, organizationIndustry);
    const byDomain =
      domain === "ALL"
        ? subDomains
            .map((d) => ({
              domain: d,
              entries: catalogForSubDomain(d.id, organizationIndustry),
            }))
            .filter((g) => g.entries.length > 0)
        : [
            {
              domain: subDomains.find((d) => d.id === domain)!,
              entries,
            },
          ];
    return byDomain;
  }, [filterDomain, organizationIndustry, subDomains]);

  if (!open) return null;

  const pick = (entry: ProjectDocumentCatalogEntry, domainLabel?: string) => {
    const live = buildDocumentCreatorLiveData({
      projectId,
      projectName,
      contactId,
      contactName,
      entry,
      domainLabel,
      boqLines,
    });

    if (live.action === "open_boq") {
      onOpenBoq?.();
      onClose();
      return;
    }
    if (live.action === "open_work_diary") {
      onOpenDiary?.({
        description:
          typeof live.projectName === "string"
            ? `יומן עבודה — ${live.projectName}`
            : undefined,
      });
      onClose();
      return;
    }
    openWorkspaceWidget?.("docCreator", live);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="doc-gen-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <header className="flex items-center gap-2 border-b border-[color:var(--border-main)] px-4 py-3">
          <FileOutput size={18} className="text-amber-300" />
          <h2 id="doc-gen-title" className="flex-1 text-sm font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-[color:var(--surface-elevated)]"
            aria-label="סגור"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-wrap gap-1 border-b border-[color:var(--border-main)] px-3 py-2">
          <button
            type="button"
            onClick={() => setFilterDomain("ALL")}
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              filterDomain === "ALL" ? "bg-amber-500/25 text-amber-100" : "hover:bg-[color:var(--surface-elevated)]"
            }`}
          >
            הכל
          </button>
          {subDomains.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setFilterDomain(d.id)}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                filterDomain === d.id
                  ? "bg-indigo-500/25 text-indigo-100"
                  : "hover:bg-[color:var(--surface-elevated)]"
              }`}
            >
              {d.labelHe}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
          {grouped.map(({ domain, entries }) => (
            <section key={domain.id}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">
                {domain.labelHe}
              </h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {entries.map((entry) => (
                  <button
                    key={`${domain.id}-${entry.id}`}
                    type="button"
                    disabled={!openWorkspaceWidget && !onOpenBoq && !onOpenDiary}
                    onClick={() => pick(entry, domain.labelHe)}
                    className={`rounded-lg border px-2 py-2 text-start text-[11px] font-medium transition-colors ${COLOR_RING[entry.color]}`}
                    title={entry.descriptionHe}
                  >
                    {entry.labelHe}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {boqLines.length > 0 ? (
          <p className="border-t border-[color:var(--border-main)] px-3 py-2 text-[10px] text-[color:var(--foreground-muted)]">
            {boqLines.length} שורות BOQ ימולאו אוטומטית במסמך
          </p>
        ) : null}
      </div>
    </div>
  );
}
