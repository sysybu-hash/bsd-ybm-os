"use client";

import React, { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FolderKanban, Loader2, Menu } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import AddProjectForm from "@/components/os/widgets/shared/AddProjectForm";
import DashboardClock from "@/components/dashboard/DashboardClock";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import DashboardCalculators from "@/components/dashboard/DashboardCalculators";
import { ClassicSidebar } from "@/components/dashboard/ClassicSidebar";
import { ClassicMobileDrawer } from "@/components/dashboard/ClassicMobileDrawer";
import { ClassicPane } from "@/components/dashboard/ClassicPane";

const loading = () => (
  <div className="flex min-h-[200px] items-center justify-center text-[color:var(--classic-muted)]">
    <Loader2 className="h-6 w-6 animate-spin text-[color:var(--classic-accent)]" aria-hidden />
  </div>
);

const CrmTableWidget = dynamic(() => import("@/components/os/widgets/CrmTableWidget"), { ssr: false, loading });
const DocumentCreatorWidget = dynamic(() => import("@/components/os/widgets/DocumentCreatorWidget"), { ssr: false, loading });
const AiScannerWidget = dynamic(() => import("@/components/os/widgets/AiScannerWidget"), { ssr: false, loading });
const AppBuilderWidget = dynamic(() => import("@/components/os/widgets/AppBuilderWidget"), { ssr: false, loading });
const PlannerCalendar = dynamic(() => import("@/components/planner/PlannerCalendar"), { ssr: false, loading });
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

const SIDEBAR_COLLAPSED_KEY = "bsd_ybm_classic_sidebar_collapsed";

type ProjectListItem = { id: string; name: string; isActive?: boolean };

function ProjectsPanel({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
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
      <section className="border border-[color:var(--classic-rule)] bg-[color:var(--surface-card)] p-5 sm:p-6">
        <AddProjectForm onCreated={() => void reload()} />
      </section>

      <section className="border border-[color:var(--classic-rule)] bg-[color:var(--surface-card)] p-5 sm:p-6">
        <h3 className="mb-4 text-base font-bold text-[color:var(--classic-ink)]">
          {t("workspaceWidgets.classicDashboard.projectsList.title")}
        </h3>
        {loadingProjects ? (
          <p className="text-sm text-[color:var(--classic-muted)]">{t("workspaceWidgets.classicDashboard.projectsList.loading")}</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-[color:var(--classic-muted)]">{t("workspaceWidgets.classicDashboard.projectsList.empty")}</p>
        ) : (
          <ul className="divide-y divide-[color:var(--classic-rule)]">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(p.id)}
                  className="flex w-full items-center gap-3 px-1 py-3 text-start transition-colors hover:text-[color:var(--classic-accent)]"
                >
                  <FolderKanban className="shrink-0 text-[color:var(--classic-accent)]" size={18} aria-hidden />
                  <span className="truncate text-sm font-semibold text-[color:var(--classic-ink)]">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CrmTab({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const { t } = useI18n();
  const [sub, setSub] = useState<CrmSubTab>("projects");
  const subTabs: ReadonlyArray<CrmSubTab> = ["projects", "clients"];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-[color:var(--classic-rule)]" role="tablist" aria-label={t("workspaceWidgets.classicDashboard.tabs.crm")}>
        {subTabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sub === id}
            onClick={() => setSub(id)}
            className={`relative px-4 py-2.5 text-sm transition-colors ${
              sub === id
                ? "font-bold text-[color:var(--classic-ink)]"
                : "font-medium text-[color:var(--classic-muted)] hover:text-[color:var(--classic-ink)]"
            }`}
          >
            {t(`workspaceWidgets.classicDashboard.crmSubTabs.${id}`)}
            {sub === id ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 bg-[color:var(--classic-accent)]" aria-hidden />
            ) : null}
          </button>
        ))}
      </div>

      {sub === "projects" ? <ProjectsPanel onOpenProject={onOpenProject} /> : <CrmTableWidget />}
    </div>
  );
}

export default function DashboardShell() {
  const { t, dir } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const openProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveTab("tasks");
  }, []);

  const tabTitle = (id: TabId) => t(`workspaceWidgets.classicDashboard.tabs.${id}`);

  return (
    <div
      dir={dir}
      className="dashboard-theme flex h-[100dvh] flex-col overflow-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--classic-rule)] bg-[color:var(--glass-bg)] px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("workspaceWidgets.classicDashboard.sidebar.openMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--classic-ink)] transition-colors hover:bg-[color:var(--surface-soft)] sm:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>
          <h1 className="text-base font-bold tracking-tight text-[color:var(--classic-ink)] sm:text-lg">
            {t("workspaceWidgets.classicDashboard.title")}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <DashboardClock />
          <Link
            href="/home"
            className="text-sm font-semibold text-[color:var(--classic-accent)] underline-offset-2 hover:underline"
          >
            {t("workspaceWidgets.classicDashboard.proMode")}
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ClassicSidebar
          activeTab={activeTab}
          onSelect={(id) => setActiveTab(id)}
          t={t}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        <main className="dashboard-main min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "home" ? (
            <ClassicPane title={tabTitle("home")} bare>
              <DashboardOverview onNavigate={(tab) => setActiveTab(tab as TabId)} />
            </ClassicPane>
          ) : null}
          {activeTab === "crm" ? (
            <ClassicPane title={tabTitle("crm")}>
              <CrmTab onOpenProject={openProject} />
            </ClassicPane>
          ) : null}
          {activeTab === "erp" ? (
            <ClassicPane title={tabTitle("erp")}>
              <DocumentCreatorWidget embeddedInHub />
            </ClassicPane>
          ) : null}
          {activeTab === "scan" ? (
            <ClassicPane title={tabTitle("scan")}>
              <AiScannerWidget embeddedInHub />
            </ClassicPane>
          ) : null}
          {activeTab === "customOs" ? (
            <ClassicPane title={tabTitle("customOs")}>
              <AppBuilderWidget embeddedInHub />
            </ClassicPane>
          ) : null}
          {activeTab === "calendar" ? (
            <ClassicPane title={tabTitle("calendar")}>
              <PlannerCalendar />
            </ClassicPane>
          ) : null}
          {activeTab === "tasks" ? (
            <ClassicPane title={tabTitle("tasks")}>
              <ProjectBoardWidget embedded projectId={selectedProjectId} />
            </ClassicPane>
          ) : null}
          {activeTab === "calculators" ? (
            <ClassicPane title={tabTitle("calculators")}>
              <DashboardCalculators />
            </ClassicPane>
          ) : null}
          {activeTab === "drive" ? (
            <ClassicPane title={tabTitle("drive")}>
              <GoogleDriveWidget />
            </ClassicPane>
          ) : null}
          {activeTab === "aiChat" ? (
            <ClassicPane title={tabTitle("aiChat")}>
              <AiChatFullWidget />
            </ClassicPane>
          ) : null}
          {activeTab === "settings" ? (
            <ClassicPane title={tabTitle("settings")}>
              <SettingsWidget />
            </ClassicPane>
          ) : null}
        </main>
      </div>

      <ClassicMobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeTab={activeTab}
        onSelect={(id) => setActiveTab(id)}
        t={t}
      />
    </div>
  );
}
