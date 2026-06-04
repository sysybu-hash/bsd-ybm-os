"use client";

import dynamic from "next/dynamic";

const OmniCanvasWorkspace = dynamic(() => import("@/components/os/OmniCanvasWorkspace"), {
  loading: () => (
    <div
      className="flex min-h-dvh items-center justify-center bg-[color:var(--background-main)]"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
});

/** טוען workspace רק למשתמשים מחוברים — לא נכלל ב-bundle של אורחי `/`. */
export default function OmniCanvasWorkspaceLoader() {
  return <OmniCanvasWorkspace />;
}
