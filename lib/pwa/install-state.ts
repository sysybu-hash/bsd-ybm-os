export type PwaInstallState = {
  /** PWA פעיל כאפליקציה (מסך הבית / standalone) */
  standalone: boolean;
  /** מותקן לפי הדפדפן (getInstalledRelatedApps) */
  relatedWebApp: boolean;
  installed: boolean;
};

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIosSafariLike(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

/** מקור אמת: standalone + getInstalledRelatedApps (כשזמין) */
export async function detectPwaInstallState(): Promise<PwaInstallState> {
  const standalone = isStandaloneDisplay();
  if (standalone) {
    return { standalone: true, relatedWebApp: false, installed: true };
  }

  let relatedWebApp = false;
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
  };

  if (typeof nav.getInstalledRelatedApps === "function") {
    try {
      const apps = await nav.getInstalledRelatedApps();
      relatedWebApp = apps.some((app) => app.platform === "webapp");
    } catch {
      relatedWebApp = false;
    }
  }

  return {
    standalone: false,
    relatedWebApp,
    installed: relatedWebApp,
  };
}
