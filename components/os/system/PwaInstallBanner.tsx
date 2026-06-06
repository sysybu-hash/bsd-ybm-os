"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import {
  detectPwaInstallState,
  isIosSafariLike,
  isStandaloneDisplay,
} from "@/lib/pwa/install-state";

const DISMISS_KEY = "bsd-ybm-pwa-install-dismissed";
const LEGACY_DISMISS_KEY = "bsd:pwa-install-dismissed";
const LEGACY_SEEN_KEY = "bsd-ybm-pwa-install-seen";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode */
  }
}

function clearDismissed(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(LEGACY_DISMISS_KEY);
    localStorage.removeItem(LEGACY_SEEN_KEY);
  } catch {
    /* private mode */
  }
}

export default function PwaInstallBanner() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [nativeInstallOffered, setNativeInstallOffered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const wasInstalledRef = useRef(false);

  const refreshInstallState = useCallback(async () => {
    const state = await detectPwaInstallState();
    const nowInstalled = state.installed;

    if (wasInstalledRef.current && !nowInstalled) {
      clearDismissed();
      setDismissed(false);
    }

    wasInstalledRef.current = nowInstalled;
    setInstalled(nowInstalled);

    if (nowInstalled) {
      setNativeInstallOffered(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsIos(isIosSafariLike());
    setDismissed(readDismissed());
    void refreshInstallState();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshInstallState();
      }
    };

    const onPageShow = () => {
      void refreshInstallState();
    };

    const onInstalled = () => {
      wasInstalledRef.current = true;
      setInstalled(true);
      setNativeInstallOffered(false);
    };

    const onDisplayMode = () => {
      void refreshInstallState();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("appinstalled", onInstalled);

    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", onDisplayMode);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener("change", onDisplayMode);
    };
  }, [refreshInstallState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (installed) return;

    const onBip = () => {
      setNativeInstallOffered(true);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [installed]);

  const dismiss = () => {
    markDismissed();
    setDismissed(true);
  };

  if (installed === null || installed || dismissed) return null;
  if (isStandaloneDisplay()) return null;

  return (
    <div
      className="fixed bottom-[calc(var(--mobile-chrome-bottom)+0.5rem)] start-3 end-3 z-[1200] mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-lg md:start-auto md:end-6"
      role="region"
      aria-label="התקנת אפליקציה"
    >
      <Download className="mt-0.5 shrink-0 text-indigo-500" size={20} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold text-[color:var(--foreground-main)]">התקינו את BSD-YBM OS</p>
        <p className="mt-1 text-[color:var(--foreground-muted)]">
          {isIos
            ? "ב-Safari: שתף → «הוסף למסך הבית» לחוויית אפליקציה מלאה."
            : nativeInstallOffered
              ? "הדפדפן מציע התקנה — השתמשו בחץ/אייקון ההתקנה בשורת הכתובת או בתפריט (⋮)."
              : "בתפריט הדפדפן (⋮) בחרו «התקן אפליקציה» או «הוסף למסך הבית»."}
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg p-1 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10"
        aria-label="סגור"
      >
        <X size={18} />
      </button>
    </div>
  );
}
