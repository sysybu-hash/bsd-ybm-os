"use client";

import { useEffect, useMemo, useState } from "react";
import { computeQuickGridDimensions } from "@/lib/launcher/quick-grid";

export function useQuickGridCanvasSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 1120, height: 560 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) setSize({ width, height });
    };

    update(el.clientWidth, el.clientHeight);

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) update(rect.width, rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return useMemo(
    () => computeQuickGridDimensions(size.width, size.height),
    [size.width, size.height],
  );
}
