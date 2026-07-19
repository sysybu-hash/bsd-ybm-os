"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LayoutDashboard, LayoutList, X } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { getLauncherNavMeta } from "@/lib/launcher/launcher-icons";
import { groupPickerOptions } from "@/lib/launcher/picker-catalog";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";

/** אזורי המערכת המוצגים בתפריט. */
const GUIDE_WIDGETS: readonly WidgetType[] = [
  "financeHub",
  "projectsHub",
  "documentsHub",
  "aiHub",
  "crmTable",
  "fieldCopilot",
  "googleDrive",
  "googleCalendar",
  "meckanoReports",
  "settings",
  "accessibility",
  "platformAdmin",
  "helpCenter",
];

type HubSubItem = {
  id: string;
  tab: string;
  labelKey: string;
  /** Icon / chip source (legacy type ok for visuals) */
  iconType: WidgetType;
};

/** Hubs עם קיצורי טאב — נפתחים כתת-תפריט ל-hub + tab */
const HUB_SUBITEMS: Partial<Record<WidgetType, readonly HubSubItem[]>> = {
  financeHub: [
    {
      id: "overview",
      tab: "overview",
      labelKey: "workspaceWidgets.titles.dashboard",
      iconType: "dashboard",
    },
    {
      id: "cashflow",
      tab: "cashflow",
      labelKey: "workspaceWidgets.titles.cashflow",
      iconType: "cashflow",
    },
  ],
  documentsHub: [
    {
      id: "scan",
      tab: "scan",
      labelKey: "workspaceWidgets.titles.aiScanner",
      iconType: "aiScanner",
    },
    {
      id: "create",
      tab: "create",
      labelKey: "workspaceWidgets.titles.docCreator",
      iconType: "docCreator",
    },
    {
      id: "archive",
      tab: "archive",
      labelKey: "workspaceWidgets.titles.erpArchive",
      iconType: "erpArchive",
    },
  ],
  aiHub: [
    {
      id: "chat",
      tab: "chat",
      labelKey: "workspaceWidgets.titles.aiChatFull",
      iconType: "aiChatFull",
    },
    {
      id: "notebook",
      tab: "notebook",
      labelKey: "workspaceWidgets.titles.notebookLM",
      iconType: "notebookLM",
    },
    {
      id: "builder",
      tab: "builder",
      labelKey: "workspaceWidgets.titles.appBuilder",
      iconType: "appBuilder",
    },
  ],
};

interface OSGuideMenuProps {
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  onClose: () => void;
}

export default function OSGuideMenu({ openWidget, onClose }: OSGuideMenuProps) {
  const { t, dir } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = GUIDE_WIDGETS.filter(
    (type) => type !== "platformAdmin" || isPlatformAdmin,
  );
  const sections = groupPickerOptions([...visible]);
  const offX = dir === "rtl" ? 24 : -24;

  const openAndClose = (type: WidgetType, data?: Record<string, unknown> | null) => {
    openWidget(type, data);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[1400]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
          aria-label={t("workspaceWidgets.guide.closeAria")}
          onClick={onClose}
        />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t("workspaceWidgets.guide.title")}
          data-testid="os-guide-menu"
          dir={dir}
          initial={{ opacity: 0, x: offX, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: offX, scale: 0.98 }}
          transition={{ type: "spring", damping: 30, stiffness: 380 }}
          className="absolute inset-x-3 bottom-3 top-16 mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl
            md:inset-auto md:bottom-24 md:top-20 md:mx-0 md:w-[22rem] md:max-w-none md:start-[calc(var(--os-sidebar-rail-width)+0.75rem)]"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-700 dark:bg-indigo-500/28 dark:text-indigo-200">
              <LayoutList size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black text-[color:var(--foreground-main)]">
                {t("workspaceWidgets.guide.title")}
              </h2>
              <p className="truncate text-[11px] font-medium text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.guide.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--foreground-main)]"
              aria-label={t("workspaceWidgets.guide.closeAria")}
            >
              <X size={17} aria-hidden />
            </button>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="flex flex-col gap-4">
              <Link
                href="/dashboard"
                onClick={onClose}
                className="group flex w-full items-center gap-3 rounded-xl bg-gradient-to-l from-[color:var(--accent)] to-[color:var(--accent-strong)] p-2.5 text-start text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/15 transition hover:brightness-110"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <LayoutDashboard size={20} strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">
                    {t("workspaceWidgets.classicDashboard.classicMode")}
                  </span>
                  <span className="block truncate text-[11px] font-medium text-white/80">
                    {t("workspaceWidgets.classicDashboard.subtitleShort")}
                  </span>
                </span>
              </Link>

              {sections.map((section) => (
                <section key={section.id} aria-labelledby={`guide-section-${section.id}`}>
                  <h3
                    id={`guide-section-${section.id}`}
                    className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wider text-[color:var(--foreground-muted)]"
                  >
                    {t(section.labelKey)}
                  </h3>
                  <ul className="flex flex-col gap-1" role="list">
                    {section.types.map((type) => {
                      const meta = getLauncherNavMeta(type);
                      const Icon = meta.icon;
                      const subs = HUB_SUBITEMS[type];
                      const isOpen = !!open[type];

                      return (
                        <li key={type}>
                          <button
                            type="button"
                            data-testid={`guide-open-${type}`}
                            onClick={() =>
                              subs
                                ? setOpen((s) => ({ ...s, [type]: !s[type] }))
                                : openAndClose(type)
                            }
                            aria-expanded={subs ? isOpen : undefined}
                            className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-start transition hover:border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)]"
                          >
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${widgetIconChipClass(type)}`}
                            >
                              <Icon size={20} strokeWidth={2} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-black text-[color:var(--foreground-main)]">
                                {t(meta.labelKey)}
                              </span>
                              <span className="block truncate text-[11px] font-medium text-[color:var(--foreground-muted)]">
                                {t(`workspaceWidgets.guide.descriptions.${type}`)}
                              </span>
                            </span>
                            {subs ? (
                              <ChevronDown
                                size={16}
                                className={`shrink-0 text-[color:var(--foreground-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                                aria-hidden
                              />
                            ) : null}
                          </button>

                          {subs && isOpen ? (
                            <ul
                              className="mt-1 flex flex-col gap-0.5 border-s border-[color:var(--border-main)] ps-2 ms-5"
                              role="list"
                            >
                              {subs.map((sub) => {
                                const subMeta = getLauncherNavMeta(sub.iconType);
                                const SubIcon = subMeta.icon;
                                return (
                                  <li key={sub.id}>
                                    <button
                                      type="button"
                                      data-testid={`guide-open-${type}-${sub.id}`}
                                      onClick={() => openAndClose(type, { tab: sub.tab })}
                                      className="group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-start transition hover:bg-[color:var(--surface-soft)]"
                                    >
                                      <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${widgetIconChipClass(sub.iconType)}`}
                                      >
                                        <SubIcon size={15} strokeWidth={2} aria-hidden />
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[color:var(--foreground-main)]">
                                        {t(sub.labelKey)}
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
