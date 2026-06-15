"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LayoutList,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { WidgetType } from "@/hooks/use-window-manager";
import SortableLauncherZone from "@/components/os/launcher/SortableLauncherZone";
import OSGuideMenu from "@/components/os/layout/OSGuideMenu";
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

/** כפתור ברזל סרגל — אייקון, ותווית שמופיעה במצב מורחב (hover). */
function RailButton({
  icon: Icon,
  label,
  chipClass,
  expanded,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  chipClass: string;
  expanded: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      title={label}
      className="group flex h-10 w-full items-center justify-start gap-2 rounded-lg transition hover:bg-[color:var(--surface-soft)]"
    >
      <span className="flex w-10 shrink-0 items-center justify-center">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${chipClass}`}>
          <Icon size={18} aria-hidden />
        </span>
      </span>
      {expanded ? (
        <span className="min-w-0 flex-1 truncate text-start text-sm font-bold text-[color:var(--foreground-main)]">
          {label}
        </span>
      ) : null}
    </button>
  );
}

export default function OSSidebar({
  openWidget,
  isOpen = false,
  closeSidebar,
  hidden,
  onMouseLeave,
}: OSSidebarProps) {
  const { t, dir } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [guideOpen, setGuideOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  // חץ שמצביע לכיוון שבו נפתח הפאנל (inline-end של הסרגל)
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  if (hidden) return null;

  // מכווץ כברירת מחדל (אייקונים); מתרחב עם תוויות במעבר עכבר (לא בזמן שהתפריט פתוח).
  const expanded = hovered && !guideOpen;
  const railWidth = expanded
    ? "var(--os-sidebar-rail-width-expanded)"
    : "var(--os-sidebar-rail-width)";

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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          onMouseLeave?.();
        }}
        style={{ ["--os-rail-w" as string]: railWidth }}
        className={`fixed z-[1200] hidden flex-col border-[color:var(--border-main)] bg-[color:var(--glass-bg)] shadow-md backdrop-blur-sm transition-[width] duration-200 md:flex
          bottom-0 left-0 right-0 h-auto w-full items-stretch border-t px-3 py-2
          md:bottom-24 md:start-3 md:end-auto md:top-20 md:max-h-[calc(100vh-8.5rem)] md:min-h-0 md:w-[var(--os-rail-w)] md:max-w-[var(--os-rail-w)] md:rounded-xl md:border md:px-2 md:py-2.5`}
        aria-label={t("workspaceWidgets.sidebar.aria")}
        dir={dir}
      >
        <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
          {/* כפתור תפריט — בסגנון אשף (גרדיאנט בולט), בראש הסרגל */}
          <div className="shrink-0 md:border-b md:border-[color:var(--border-main)] md:pb-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              data-testid="os-guide-menu-trigger"
              aria-label={t("workspaceWidgets.sidebar.menu")}
              title={t("workspaceWidgets.sidebar.menu")}
              className="group relative flex h-10 w-full items-center justify-start gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30 ring-1 ring-white/15 transition hover:from-indigo-500 hover:to-violet-500"
            >
              <span className="flex w-10 shrink-0 items-center justify-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <LayoutList size={18} aria-hidden />
                </span>
              </span>
              {expanded ? (
                <>
                  <span className="shrink-0 text-sm font-black">
                    {t("workspaceWidgets.sidebar.menu")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start text-[11px] font-semibold text-white/75">
                    ({t("workspaceWidgets.sidebar.menuHint")})
                  </span>
                  <Chevron size={16} className="shrink-0 opacity-90" aria-hidden />
                </>
              ) : null}
            </button>
          </div>

          <nav
            aria-label={t("workspaceWidgets.sidebar.appsAria")}
            className="no-scrollbar flex min-h-0 flex-1 flex-row items-center justify-around gap-1 overflow-x-auto overflow-y-hidden overscroll-contain py-0.5 md:flex-col md:items-stretch md:justify-start md:gap-1 md:overflow-x-hidden md:overflow-y-auto md:px-0 md:py-0.5"
          >
            <SortableLauncherZone
              zone="sidebar"
              variant="sidebar"
              onOpen={openWidget}
              expanded={expanded}
              className="flex min-h-0 flex-1 flex-row items-center justify-around gap-1 md:flex-col md:items-stretch md:justify-start md:gap-1"
            />
          </nav>

          <div className="flex shrink-0 items-center justify-around gap-1 border-t border-[color:var(--border-main)] pt-2 md:mt-1 md:flex-col md:items-stretch md:justify-start md:gap-1 md:border-t md:pt-2">
            <RailButton
              icon={Settings}
              label={t("workspaceWidgets.sidebar.settings")}
              chipClass={widgetIconChipClass("settings")}
              expanded={expanded}
              onClick={() => openWidget("settings")}
            />
            <RailButton
              icon={HelpCircle}
              label={t("workspaceWidgets.sidebar.help")}
              chipClass={helpIconChipClass}
              expanded={expanded}
              onClick={() => openWidget("helpCenter")}
            />
            {isPlatformAdmin ? (
              <RailButton
                icon={Shield}
                label={t("workspaceWidgets.sidebar.platformAdmin")}
                chipClass={widgetIconChipClass("platformAdmin")}
                expanded={expanded}
                onClick={() => openWidget("platformAdmin")}
              />
            ) : null}
          </div>
        </div>
      </motion.aside>

      {guideOpen ? (
        <OSGuideMenu
          openWidget={(type) => {
            openWidget(type);
            setGuideOpen(false);
          }}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
    </>
  );
}
