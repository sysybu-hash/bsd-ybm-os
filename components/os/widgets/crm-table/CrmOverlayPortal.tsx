"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function CrmOverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-slate-900/80 p-4 backdrop-blur-md custom-scrollbar md:p-6">
      {children}
    </div>,
    document.body,
  );
}
