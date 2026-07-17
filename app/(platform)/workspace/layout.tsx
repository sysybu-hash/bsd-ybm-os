"use client";

import { OsBootHost } from "@/components/os/boot/OsBootHost";

/** Keeps one boot splash across loading ↔ page and chunk swaps. */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OsBootHost>{children}</OsBootHost>;
}
