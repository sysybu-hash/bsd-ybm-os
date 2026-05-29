"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import MarketingHeroOmnibarUI from "@/components/landing/marketing/MarketingHeroOmnibarUI";
import type { MarketingHeroOmnibarState } from "@/hooks/useMarketingHeroOmnibar";
import { setMarketingMobileOverlayOpen } from "@/lib/marketing/mobile-overlay-body";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  omnibar: MarketingHeroOmnibarState;
}>;

export default function MarketingMobileOmnibarSheet({ open, onClose, omnibar }: Props) {
  const { t, dir } = useI18n();

  useEffect(() => {
    setMarketingMobileOverlayOpen(open);
    return () => setMarketingMobileOverlayOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2590] bg-slate-950/70 backdrop-blur-sm md:hidden"
            aria-label={t("marketingHome.cinematic.omnibarSheetClose")}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("marketingHome.cinematic.omnibarLabel")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[2600] mkt-glass-strong border-t border-white/10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
            dir={dir}
          >
            <div className="mx-auto flex max-w-lg items-center justify-between gap-2 pb-2">
              <p className="text-sm font-bold text-slate-200">
                {t("marketingHome.cinematic.omnibarLabel")}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-slate-300 hover:bg-white/10"
                aria-label={t("marketingHome.cinematic.omnibarSheetClose")}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <MarketingHeroOmnibarUI omnibar={omnibar} variant="sheet" />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
