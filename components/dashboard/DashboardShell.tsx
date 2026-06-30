"use client";

import React, { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FolderKanban, Loader2, MonitorPlay } from "lucide-react";
import { CLASSIC_SECTIONS } from "@/lib/classic/sections";
import { useI18n } from "@/components/os/system/I18nProvider";
import AddProjectForm from "@/components/os/widgets/shared/AddProjectForm";
import DashboardClock from "@/components/dashboard/DashboardClock";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import DashboardCalculators from "@/components/dashboard/DashboardCalculators";

const loading = () => (
  <div className="flex min-h-[200px] items-center justify-center text-[color:var(--foreground-muted)]">
    <Loader2 className="h-6 w-6 animate-spin text-[color:var(--accent)]" aria-hidden />
  </div>
);

const CrmTableWidget = dynamic(() => import("@/components/os/widgets/CrmTableWidget"), { ssr: false, loading });
const DocumentCreatorWidget = dynamic(() => import("@/components/os/widgets/DocumentCreatorWidget"), { ssr: false, loading });
const AiScannerWidget = dynamic(() => import("@/components/os/widgets/AiScannerWidget"), { ssr: false, loading });
const AppBuilderWidget = dynamic(() => import("@/components/os/widgets/AppBuilderWidget"), { ssr: false, loading });
const JewishCalendarWidget = dynamic(() => import("@/components/os/widgets/JewishCalendarWidget"), { ssr: false, loading });
const ProjectBoardWidget = dynamic(() => import("@/components/os/widgets/ProjectBoardWidget"), { ssr: false, loading });
const GoogleDriveWidget = dynamic(() => import("@/components/os/widgets/GoogleDriveWidget"), { ssr: false, loading });
const AiChatFullWidget = dynamic(() => import("@/components/os/widgets/AiChatFullWidget"), { ssr: false, loading });
const SettingsWidget = dynamic(() => import("@/components/os/widgets/SettingsWidget"), { ssr: false, loading });

type TabId =
  | "home"
  | "crm"
  | "erp"
  | "scan"
  | "customOs"
  | "calendar"
  | "tasks"
  | "calculators"
  | "drive"
  | "aiChat"
  | "settings";
type CrmSubTab = "projects" | "clients";

// Desktop tab list — derived from the shared classic-sections registry.
const TABS = CLASSIC_SECTIONS;

/** Frosted card shell used across the dashboard panels. */
const CARD =
  "rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-[var(--shadow-md)]";

type ProjectListItem = { id: string; name: string; isActive?: boolean };

function ProjectsPanel() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const reload = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const data = (await res.json()) as { projects?: ProjectListItem[] };
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className={`${CARD} p-5 sm:p-6`}>
        <AddProjectForm onCreated={() => void reload()} />
      </section>

      <section className={`${CARD} p-5 sm:p-6`}>
        <h3 className="mb-4 text-lg font-bold text-[color:var(--foreground-main)]">
          {t("workspaceWidgets.classicDashboard.projectsList.title")}
        </h3>
        {loadingProjects ? (
          <p className="text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.classicDashboard.projectsList.loading")}</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.classicDashboard.projectsList.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-3 transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--accent-soft)]"
              >
                <FolderKanban className="shrink-0 text-[color:var(--accent)]" size={18} aria-hidden />
                <span className="truncate text-sm font-semibold text-[color:var(--foreground-main)]">{p.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CrmTab() {
  const { t } = useI18n();
  const [sub, setSub] = useState<CrmSubTab>("projects");
  const subTabs: ReadonlyArray<CrmSubTab> = ["projects", "clients"];

  return (
    <div className="space-y-5">
      <div className="flex gap-2" role="tablist" aria-label={t("workspaceWidgets.classicDashboard.tabs.crm")}>
        {subTabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sub === id}
            onClick={() => setSub(id)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              sub === id
                ? "border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                : "border-transparent text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
            }`}
          >
            {t(`workspaceWidgets.classicDashboard.crmSubTabs.${id}`)}
          </button>
        ))}
      </div>

      {sub === "projects" ? <ProjectsPanel /> : <CrmTableWidget />}
    </div>
  );
}

export default function DashboardShell() {
  const { t, dir } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("home");

  return (
    <div
      dir={dir}
      className="dashboard-theme flex h-[100dvh] flex-col overflow-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
    >
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--glass-bg)] px-4 py-3 backdrop-blur-xl sm:px-6">
        <h1 className="text-lg font-extrabold tracking-tight text-[color:var(--foreground-main)] sm:text-xl">
          {t("workspaceWidgets.classicDashboard.title")}
        </h1>
        <div className="flex items-center gap-3">
          <DashboardClock />
          <Link
            href="/workspace"
            className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-main)] shadow-sm transition-all hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            <MonitorPlay size={16} aria-hidden />
            <span className="hidden sm:inline">{t("workspaceWidgets.classicDashboard.proMode")}</span>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav
          aria-label={t("workspaceWidgets.classicDashboard.title")}
          className="flex w-16 shrink-0 flex-col gap-1 overflow-y-auto border-e border-[color:var(--border-main)] bg-[color:var(--glass-bg)] p-2 backdrop-blur-xl sm:w-56 sm:p-3"
        >
          {TABS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id}
              className={`flex items-center gap-3 rounded-xl border-s-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                activeTab === id
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                  : "border-transparent text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
              }`}
              title={t(`workspaceWidgets.classicDashboard.tabs.${id}`)}
            >
              <Icon size={20} className="shrink-0" aria-hidden />
              <span className="hidden truncate sm:inline">{t(`workspaceWidgets.classicDashboard.tabs.${id}`)}</span>
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="dashboard-main min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "home" ? <DashboardOverview onNavigate={(tab) => setActiveTab(tab as TabId)} /> : null}
          {activeTab === "crm" ? <CrmTab /> : null}
          {activeTab === "erp" ? <DocumentCreatorWidget embeddedInHub /> : null}
          {activeTab === "scan" ? <AiScannerWidget embeddedInHub /> : null}
          {activeTab === "customOs" ? <AppBuilderWidget embeddedInHub /> : null}
          {activeTab === "calendar" ? <JewishCalendarWidget /> : null}
          {activeTab === "tasks" ? <ProjectBoardWidget embedded /> : null}
          {activeTab === "calculators" ? <DashboardCalculators /> : null}
          {activeTab === "drive" ? <GoogleDriveWidget /> : null}
          {activeTab === "aiChat" ? <AiChatFullWidget /> : null}
          {activeTab === "settings" ? <SettingsWidget /> : null}
        </main>
      </div>
    </div>
  );
}
