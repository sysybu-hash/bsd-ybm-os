"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = Readonly<{
  children: ReactNode;
  className?: string;
  delay?: number;
  /** תוכן מעל הקיפול — נראה מיד בטעינה (Hero) */
  eager?: boolean;
}>;

export default function ScrollReveal({ children, className = "", delay = 0, eager = false }: Props) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(eager);

  useEffect(() => {
    if (eager || reduceMotion) {
      setRevealed(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const markVisible = () => setRevealed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markVisible();
        }
      },
      { threshold: 0.05, rootMargin: "80px 0px 40px 0px" },
    );

    observer.observe(el);
    const failSafe = window.setTimeout(markVisible, 2200);

    return () => {
      observer.disconnect();
      window.clearTimeout(failSafe);
    };
  }, [eager, reduceMotion]);

  if (reduceMotion || eager) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
