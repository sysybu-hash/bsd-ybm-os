"use client";

import React from "react";
import { motion } from "framer-motion";
import { HelpCircle, Settings, Shield } from "lucide-react";
import { WidgetType } from "@/hooks/use-window-manager";
import SortableLauncherZone from "@/components/os/launcher/SortableLauncherZone";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { helpIconChipClass, widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";

interface OSSidebarProps {
  openWidget: (type: WidgetType) => void;
  isOpen?: boolean;
  closeSidebar?: () => void;
  hidden?: boolean;
  onMouseLeave?: () => void;
}

export default function OSSidebar({ openWidget, isOpen = false, closeSidebar, hidden, onMouseLeave }: OSSidebarProps) {
  const { t, dir } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();

  if (hidden) return null;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[1150] hidden bg-slate-950/45 backdrop-blur-[2px] md:block"
          onClick={closeSidebar}
          aria-label={t("workspaceWidgets.sidebar.closeAria")}
        />
      )}

      <motion.aside
        initial={{ x: dir === "rtl" ? -20 : 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
        onMouseLeave={onMouseLeave}
        className={`fixed z-[1200] hidden flex-col border-[color:var(--border-main)] bg-[color:var(--glass-bg)] shadow-md backdrop-blur-sm transition-transform duration-200 md:flex
          bottom-0 left-0 right-0 h-auto w-full items-stretch border-t px-3 py-2
          ${isOpen ? "translate-y-0" : "translate-y-0"}
          md:bottom-28 md:start-5 md:end-auto md:top-24 md:max-h-[calc(100vh-12rem)] md:min-h-0 md:w-[var(--os-sidebar-rail-width)] md:max-w-[var(--os-sidebar-rail-width)] md:rounded-xl md:border md:px-1.5 md:py-3`}
        aria-label={t("workspaceWidgets.sidebar.aria")}
        dir={dir}
      >
        <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
          <nav
            aria-label={t("workspaceWidgets.sidebar.appsAria")}
            className="no-scrollbar flex min-h-0 flex-1 flex-row items-center justify-around gap-1 overflow-x-auto overflow-y-hidden overscroll-contain py-0.5 md:flex-col md:justify-start md:gap-2.5 md:overflow-x-hidden md:overflow-y-auto md:px-0.5 md:py-0.5"
          >
            <SortableLauncherZone
              zone="sidebar"
              variant="sidebar"
              onOpen={openWidget}
              className="flex min-h-0 flex-1 flex-row items-center justify-around gap-1 md:flex-col md:justify-start md:gap-2.5"
            />
          </nav>

          <div className="flex shrink-0 items-center justify-around gap-1 border-t border-[color:var(--border-main)] pt-2 md:mt-1 md:flex-col md:justify-start md:gap-2 md:border-t md:pt-2">
            <button
              type="button"
              onClick={() => openWidget("settings")}
              className="group flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)]"
              aria-label={t("workspaceWidgets.sidebar.settings")}
              title={t("workspaceWidgets.sidebar.settings")}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${widgetIconChipClass("settings")}`}>
                <Settings size={19} aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={() => openWidget("helpCenter")}
              className="group flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)]"
              aria-label={t("workspaceWidgets.sidebar.help")}
              title={t("workspaceWidgets.sidebar.help")}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${helpIconChipClass}`}>
                <HelpCircle size={19} aria-hidden />
              </span>
            </button>
            {isPlatformAdmin ? (
              <button
                type="button"
                onClick={() => openWidget("platformAdmin")}
                className="group flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)]"
                aria-label={t("workspaceWidgets.sidebar.platformAdmin")}
                title={t("workspaceWidgets.sidebar.platformAdmin")}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${widgetIconChipClass("platformAdmin")}`}
                >
                  <Shield size={19} aria-hidden />
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </motion.aside>
    </>
  );
}
