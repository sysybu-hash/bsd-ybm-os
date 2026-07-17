"use client";

import dynamic from "next/dynamic";

void import("@/components/os/OmniCanvasWorkspace");

const OmniCanvasWorkspace = dynamic(() => import("@/components/os/OmniCanvasWorkspace"), {
  ssr: false,
  // Boot splash lives in workspace/layout OsBootHost — do not remount it here.
  loading: () => null,
});

/** טוען workspace רק למשתמשים מחוברים — לא נכלל ב-bundle של אורחי `/`. */
export default function OmniCanvasWorkspaceLoader() {
  return <OmniCanvasWorkspace />;
}
