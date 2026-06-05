"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "bsd-ybm-pwa-install-dismissed";
/** מפתח ישן — נשמר לתאימות לאחור */
const LEGACY_DISMISS_KEY = "bsd:pwa-install-dismissed";
const LEGACY_SEEN_KEY = "bsd-ybm-pwa-install-seen";
const WAS_INSTALLED_KEY = "bsd-ybm-pwa-was-installed";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function readStorageFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStorageFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode / quota */
  }
}

function removeStorageFlag(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode / quota */
  }
}

/** אם הוסרו מהמסך הבית — מאפסים דחייה כדי להציג שוב את ההתקנה */
function syncInstallRemovalState(): void {
  const standalone = isStandaloneDisplay();
  const wasInstalled = readStorageFlag(WAS_INSTALLED_KEY);

  if (standalone) {
    writeStorageFlag(WAS_INSTALLED_KEY);
    return;
  }

  if (wasInstalled) {
    removeStorageFlag(WAS_INSTALLED_KEY);
    removeStorageFlag(DISMISS_KEY);
    removeStorageFlag(LEGACY_DISMISS_KEY);
    removeStorageFlag(LEGACY_SEEN_KEY);
  }
}

function shouldSuppressPrompt(): boolean {
  if (isStandaloneDisplay()) return true;
  return readStorageFlag(DISMISS_KEY) || readStorageFlag(LEGACY_DISMISS_KEY);
}

function markPromptDismissed(): void {
  writeStorageFlag(DISMISS_KEY);
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export default function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const shownThisMount = useRef(false);

  const revealOnce = useCallback(() => {
    if (shownThisMount.current) return;
    if (shouldSuppressPrompt()) return;

    shownThisMount.current = true;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    syncInstallRemovalState();
    if (shouldSuppressPrompt()) return;

    const ios = isIosDevice();
    setIsIos(ios);
    if (ios) {
      revealOnce();
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      revealOnce();
    };

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [revealOnce]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onDisplayMode = () => {
      syncInstallRemovalState();
      if (isStandaloneDisplay()) {
        setVisible(false);
        setDeferred(null);
      }
    };

    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", onDisplayMode);
    return () => mq.removeEventListener("change", onDisplayMode);
  }, []);

  const dismiss = () => {
    markPromptDismissed();
    setVisible(false);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (outcome === "accepted") {
      writeStorageFlag(WAS_INSTALLED_KEY);
      return;
    }
    markPromptDismissed();
  };

  if (!visible) return null;

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
            : "התקנה מהירה לגישה מהירה, מסך מלא ועבודה יציבה במובייל."}
        </p>
        {!isIos && deferred ? (
          <button
            type="button"
            onClick={() => void install()}
            className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
          >
            התקן עכשיו
          </button>
        ) : null}
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
