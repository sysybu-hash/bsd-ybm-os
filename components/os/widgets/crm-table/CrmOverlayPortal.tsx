"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useIsMounted } from "@/hooks/use-is-mounted";

export function CrmOverlayPortal({ children }: { children: React.ReactNode }) {
  const mounted = useIsMounted();
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/80 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md custom-scrollbar md:px-6">
      {children}
    </div>,
    document.body,
  );
}
