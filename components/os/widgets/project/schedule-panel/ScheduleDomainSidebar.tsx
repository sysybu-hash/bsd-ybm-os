"use client";

import React from "react";
import { FileOutput } from "lucide-react";
import type { DocType } from "@prisma/client";
import type { ProjectSubDomain, ProjectSubDomainId } from "@/lib/project-sub-domains";
import type { ScheduleLabels } from "./types";

type ScheduleDomainSidebarProps = {
  ganttTaskCount: number;
  selectedDomain: ProjectSubDomainId | "ALL";
  docPickerDomain: ProjectSubDomainId | null;
  counts: Map<ProjectSubDomainId, number>;
  projectSubDomains: ProjectSubDomain[];
  hasDocWidget: boolean;
  labels: ScheduleLabels;
  onSelectDomain: (id: ProjectSubDomainId | "ALL") => void;
  onToggleDocPicker: (id: ProjectSubDomainId) => void;
  onOpenDoc: (docType: DocType, domain: ProjectSubDomain) => void;
};

export function ScheduleDomainSidebar({
  ganttTaskCount,
  selectedDomain,
  docPickerDomain,
  counts,
  projectSubDomains,
  hasDocWidget,
  labels,
  onSelectDomain,
  onToggleDocPicker,
  onOpenDoc,
}: ScheduleDomainSidebarProps) {
  return (
    <nav className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto p-1 text-xs">
      <button
        type="button"
        onClick={() => onSelectDomain("ALL")}
        className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-start ${
          selectedDomain === "ALL"
            ? "bg-amber-500/20 text-amber-100"
            : "hover:bg-[color:var(--surface-elevated)]"
        }`}
      >
        <span>{labels.allDomains}</span>
        <span className="text-[10px] text-[color:var(--foreground-muted)]">{ganttTaskCount}</span>
      </button>

      {projectSubDomains.map((domain) => {
        const Icon = domain.icon;
        const count = counts.get(domain.id) ?? 0;
        const active = selectedDomain === domain.id;

        return (
          <div key={domain.id} className="space-y-0.5">
            <button
              type="button"
              onClick={() => onSelectDomain(domain.id)}
              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-start ${
                active ? "bg-indigo-500/20 text-indigo-100" : "hover:bg-[color:var(--surface-elevated)]"
              }`}
            >
              <Icon size={13} className="shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate">{domain.labelHe}</span>
              <span className="text-[10px] text-[color:var(--foreground-muted)]">{count}</span>
            </button>

            {active && hasDocWidget && domain.docShortcuts.length > 0 ? (
              <div className="me-2 flex flex-col gap-0.5 border-e border-[color:var(--border-main)]/50 pe-2">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-200/90 hover:bg-amber-500/10"
                  onClick={() => onToggleDocPicker(domain.id)}
                >
                  <FileOutput size={10} />
                  {labels.generateDoc}
                </button>
                {docPickerDomain === domain.id
                  ? domain.docShortcuts.map((shortcut) => (
                      <button
                        key={shortcut.docType}
                        type="button"
                        className="rounded px-2 py-0.5 text-start text-[10px] hover:bg-[color:var(--surface-elevated)]"
                        onClick={() => onOpenDoc(shortcut.docType, domain)}
                      >
                        {shortcut.labelHe}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
