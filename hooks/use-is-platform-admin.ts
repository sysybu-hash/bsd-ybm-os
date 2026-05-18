"use client";

import { useSession } from "next-auth/react";

/** מנהל BSD-YBM-OS (yb@bsd-ybm.co.il, sysybu@gmail.com / OS_ADMIN_EMAILS) — SUPER_ADMIN בסשן */
export function useIsPlatformAdmin(): boolean {
  const { data: session } = useSession();
  return session?.user?.role === "SUPER_ADMIN";
}
