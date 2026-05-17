export type DriveViewMode = "list" | "grid" | "compact" | "details";

export const DRIVE_VIEW_MODE_STORAGE_KEY = "bsd:drive-view-mode";

const MODES: DriveViewMode[] = ["list", "grid", "compact", "details"];

export function isDriveViewMode(v: string): v is DriveViewMode {
  return MODES.includes(v as DriveViewMode);
}

export function loadDriveViewMode(): DriveViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const raw = localStorage.getItem(DRIVE_VIEW_MODE_STORAGE_KEY);
    if (raw && isDriveViewMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

export function saveDriveViewMode(mode: DriveViewMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRIVE_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
