"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export type OsFloatingPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  children: React.ReactNode;
  /** מיקום בדסקטופ — ברירת מחדל מרכז */
  placement?: "center" | "end";
  className?: string;
  zIndex?: number;
};

export default function OsFloatingPanel({
  open,
  onClose,
  title,
  titleId = "os-floating-panel-title",
  children,
  placement = "center",
  className = "",
  zIndex = 1260,
}: OsFloatingPanelProps) {
  const { dir } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const backdropZ = zIndex - 10;
  const positionClass =
    placement === "end"
      ? "md:inset-x-auto md:bottom-auto md:left-auto md:right-6 md:top-20 md:max-h-[min(85dvh,720px)] md:w-[min(420px,calc(100vw-2rem))] md:translate-x-0 md:translate-y-0"
      : "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(520px,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            style={{ zIndex: backdropZ }}
            aria-label="סגור"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={`fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-h-[min(85dvh,720px)] overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl ${positionClass} ${className}`}
            style={{ zIndex }}
            dir={dir}
          >
            <motion.div className="flex max-h-[inherit] flex-col">
              <motion.header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-4 py-3">
                <h2 id={titleId} className="truncate text-sm font-black text-[color:var(--foreground-main)]">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-main)] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)]"
                  aria-label="סגור"
                >
                  <X size={18} aria-hidden />
                </button>
              </motion.header>
              <motion.div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">
                {children}
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
