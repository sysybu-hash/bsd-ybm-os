"use client";

import OsBootSplash from "@/components/os/boot/OsBootSplash";

/** Route-level loading — same boot chrome as the client gate. */
export default function Loading() {
  return <OsBootSplash phase="chunk" />;
}
