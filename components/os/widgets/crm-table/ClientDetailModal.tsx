"use client";

import React, { useState } from "react";
import { X, Edit3 } from "lucide-react";
import { OsIconButton } from "@/components/os/ui";
import type { Client, ProjectOption, OpenWorkspaceWidgetFn } from "./types";
import { CrmOverlayPortal } from "./CrmOverlayPortal";
import { ClientTimelineTab } from "./ClientTimelineTab";
import { ClientDetailsSection } from "./ClientDetailsSection";

type CrmSyncStatus = "unlinked" | "syncing" | "synced" | "linked";

type ClientDetailModalProps = {
  client: Client;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  onChange: (updated: Client) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  projectOptions: ProjectOption[];
  savingProject: boolean;
  creatingProject: boolean;
  crmSyncStatus: CrmSyncStatus;
  onSaveProject: (projectId: string | null) => Promise<void>;
  onCreateProject: () => Promise<void>;
  onOpenProjectHub: () => void;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
  t: (key: string) => string;
};

export function ClientDetailModal({
  client,
  isEditing,
  setIsEditing,
  onChange,
  onClose,
  onSave,
  projectOptions,
  savingProject,
  creatingProject,
  crmSyncStatus,
  onSaveProject,
  onCreateProject,
  onOpenProjectHub,
  openWorkspaceWidget,
  t,
}: ClientDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "timeline">("details");

  const tagsString = (client.tags ?? []).join(", ");

  return (
    <CrmOverlayPortal>
      <div className="my-auto flex w-full max-w-4xl max-h-[min(90dvh,calc(100dvh-2rem))] shrink-0 flex-col bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl">
        <div className="p-4 sm:p-8 border-b border-[color:var(--border-main)] flex justify-between items-start gap-3">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-2xl sm:w-20 sm:h-20 sm:rounded-3xl bg-gradient-to-tr from-[color:var(--accent)] to-teal-600 flex items-center justify-center text-xl sm:text-3xl font-black text-white shadow-xl">
              {client.name?.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="text-xl sm:text-3xl font-black text-[color:var(--foreground-main)] mb-1 sm:mb-2 truncate">{client.name}</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    client.status === "active"
                      ? "bg-[color:var(--state-success)]/10 text-[color:var(--state-success)]"
                      : client.status === "lead"
                        ? "bg-[color:var(--state-info)]/10 text-[color:var(--state-info)]"
                        : "bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]"
                  }`}
                >
                  {client.status}
                </span>
                {(client.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <OsIconButton
              label={t("workspaceWidgets.itemActions.edit")}
              active={isEditing}
              className={isEditing ? "!bg-[color:var(--state-success)] !text-white" : ""}
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit3 size={20} aria-hidden />
            </OsIconButton>
            <OsIconButton label={t("common.close")} onClick={onClose}>
              <X size={20} aria-hidden />
            </OsIconButton>
          </div>
        </div>

        <div className="px-4 sm:px-8 pt-4 flex gap-2 border-b border-[color:var(--border-main)]">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl ${
              activeTab === "details"
                ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                : "text-[color:var(--foreground-muted)]"
            }`}
          >
            {t("workspaceWidgets.crmTable.tabDetails")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl ${
              activeTab === "timeline"
                ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                : "text-[color:var(--foreground-muted)]"
            }`}
          >
            {t("workspaceWidgets.crmTable.tabTimeline")}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-8 custom-scrollbar">
          {activeTab === "timeline" ? (
            <div className="space-y-4">
              <ClientTimelineTab clientId={client.id} t={t} />
            </div>
          ) : (
            <ClientDetailsSection
              client={client} isEditing={isEditing} tagsString={tagsString}
              crmSyncStatus={crmSyncStatus} projectOptions={projectOptions}
              savingProject={savingProject} creatingProject={creatingProject}
              openWorkspaceWidget={openWorkspaceWidget} t={t}
              onChange={onChange} onSave={onSave} onSaveProject={onSaveProject}
              onCreateProject={onCreateProject} onOpenProjectHub={onOpenProjectHub}
            />
          )}
        </div>
      </div>
    </CrmOverlayPortal>
  );
}
