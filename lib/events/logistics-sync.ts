"use client";

import { useEffect } from "react";

const LOGISTICS_MUTATION_EVENT = "os:logistics-mutation";

export type LogisticsMutationDetail = {
  timestamp: number;
  scope?: "inventory" | "assets";
};

/** Broadcast after inventory/asset mutations (quantity, checkout, etc.). */
export function emitLogisticsMutation(scope?: LogisticsMutationDetail["scope"]): void {
  if (typeof window === "undefined") return;

  const event = new CustomEvent<LogisticsMutationDetail>(LOGISTICS_MUTATION_EVENT, {
    detail: { timestamp: Date.now(), scope },
  });
  window.dispatchEvent(event);
}

export function useLogisticsSync(onUpdate: () => void, scope?: LogisticsMutationDetail["scope"]): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<LogisticsMutationDetail>;
      if (scope && custom.detail?.scope && custom.detail.scope !== scope) return;
      onUpdate();
    };

    window.addEventListener(LOGISTICS_MUTATION_EVENT, handler);
    return () => window.removeEventListener(LOGISTICS_MUTATION_EVENT, handler);
  }, [onUpdate, scope]);
}
