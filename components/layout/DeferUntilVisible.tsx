"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useClientFlag } from "@/hooks/use-client-flag";

/** Browsers without IntersectionObserver get the content immediately. */
const noObserverSupport = () => typeof IntersectionObserver === "undefined";

type Props = Readonly<{
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: string;
}>;

/** טוען children רק כשנכנסים ל-viewport — מפחית TBT בדף נחיתה */
export default function DeferUntilVisible({
  children,
  fallback = null,
  rootMargin = "200px 0px",
  minHeight = "24rem",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const unsupported = useClientFlag(noObserverSupport);
  const [intersected, setIntersected] = useState(false);
  const visible = unsupported || intersected;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIntersected(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} style={{ minHeight }}>
      {visible ? children : fallback}
    </div>
  );
}
