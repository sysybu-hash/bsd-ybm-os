"use client";

import dynamic from "next/dynamic";

void import("@/components/os/OmniCanvasWorkspace");

const OmniCanvasWorkspace = dynamic(() => import("@/components/os/OmniCanvasWorkspace"), {
  loading: () => null,
});

/** טוען workspace רק למשתמשים מחוברים — לא נכלל ב-bundle של אורחי `/`. */
export default function OmniCanvasWorkspaceLoader() {
  return <OmniCanvasWorkspace />;
}
