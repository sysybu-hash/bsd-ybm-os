"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { UtilityRailTab } from "@/lib/utility-rail/prefs";
import { UTILITY_TABS } from "@/lib/utility-rail/tabs";

type Props = {
  open: boolean;
  activeTab: UtilityRailTab | null;
  onClose: () => void;
  children: React.ReactNode;
};

export default function UtilityTabPanel({ open, activeTab, onClose, children }: Props) {
  const { t, dir } = useI18n();
  const tabDef = UTILITY_TABS.find((tab) => tab.id === activeTab);
  const title = tabDef ? t(tabDef.labelKey) : "";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            key="utility-rail-backdrop"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[1180] bg-slate-950/45 backdrop-blur-[2px] md:hidden"
            onClick={onClose}
            aria-label={t("workspaceWidgets.utilityRail.closeAria")}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open && activeTab ? (
          <motion.aside
            key="utility-rail-panel"
            role="complementary"
            aria-label={title}
            initial={{ x: dir === "rtl" ? -24 : 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir === "rtl" ? -24 : 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="os-utility-rail-panel fixed z-[1185] flex flex-col overflow-hidden border-[color:var(--border-main)] bg-[color:var(--glass-bg)] shadow-lg backdrop-blur-sm
              end-[var(--os-utility-rail-tab-width)]
              top-[var(--workspace-inset-top)] bottom-[var(--workspace-inset-bottom)]
              w-[min(100vw,var(--os-utility-rail-panel-width))]
              border-s md:rounded-s-xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-3 py-2.5">
              <h2 className="text-sm font-bold text-[color:var(--foreground-main)]">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                aria-label={t("workspaceWidgets.utilityRail.closeAria")}
              >
                <X size={18} aria-hidden />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
