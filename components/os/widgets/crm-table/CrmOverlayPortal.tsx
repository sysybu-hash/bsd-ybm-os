"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function CrmOverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-slate-900/80 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md custom-scrollbar md:px-6">
      {children}
    </div>,
    document.body,
  );
}
