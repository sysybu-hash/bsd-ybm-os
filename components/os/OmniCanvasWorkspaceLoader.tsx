"use client";

import dynamic from "next/dynamic";
import OsBootSplash from "@/components/os/boot/OsBootSplash";

void import("@/components/os/OmniCanvasWorkspace");

const OmniCanvasWorkspace = dynamic(() => import("@/components/os/OmniCanvasWorkspace"), {
  loading: () => <OsBootSplash phase="chunk" />,
});

/** טוען workspace רק למשתמשים מחוברים — לא נכלל ב-bundle של אורחי `/`. */
export default function OmniCanvasWorkspaceLoader() {
  return <OmniCanvasWorkspace />;
}
