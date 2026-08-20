"use client";

import { useEffect } from "react";

const PROCUREMENT_MUTATION_EVENT = "os:procurement-mutation";

export type ProcurementMutationDetail = {
  timestamp: number;
  scope?: "requests" | "orders" | "suppliers";
};

export function emitProcurementMutation(scope?: ProcurementMutationDetail["scope"]): void {
  if (typeof window === "undefined") return;

  const event = new CustomEvent<ProcurementMutationDetail>(PROCUREMENT_MUTATION_EVENT, {
    detail: { timestamp: Date.now(), scope },
  });
  window.dispatchEvent(event);
}

export function useProcurementSync(
  onUpdate: () => void,
  scope?: ProcurementMutationDetail["scope"],
): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<ProcurementMutationDetail>;
      if (scope && custom.detail?.scope && custom.detail.scope !== scope) return;
      onUpdate();
    };

    window.addEventListener(PROCUREMENT_MUTATION_EVENT, handler);
    return () => window.removeEventListener(PROCUREMENT_MUTATION_EVENT, handler);
  }, [onUpdate, scope]);
}
