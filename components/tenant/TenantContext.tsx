"use client";

import React, { createContext, useContext } from "react";
import type { ResolvedTenant } from "@/lib/core/tenant-host";

const TenantCtx = createContext<ResolvedTenant | null>(null);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: ResolvedTenant | null;
  children: React.ReactNode;
}) {
  return <TenantCtx.Provider value={tenant}>{children}</TenantCtx.Provider>;
}

export function useTenant(): ResolvedTenant | null {
  return useContext(TenantCtx);
}
