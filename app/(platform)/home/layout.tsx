"use client";

import { OsBootHost } from "@/components/os/boot/OsBootHost";

/** Same boot shell as /workspace — /home is a friendly alias for the OS home. */
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OsBootHost>{children}</OsBootHost>;
}
