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
  /**
   * SSR-safe: התוכן גלוי כברירת מחדל (opacity:1 ב-HTML). את ההסתרה+אנימציה
   * מפעילים רק בצד הלקוח, ורק לאלמנטים שמתחת לקיפול — כך גם אם ה-JS נכשל
   * או IntersectionObserver לא יורה, התוכן לעולם לא נשאר מוסתר (באג מסך ריק במובייל).
   */
  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    if (eager || reduceMotion) {
      setRevealed(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    // אלמנט שכבר בתוך ה-viewport נשאר גלוי (ללא הבהוב); רק מה שמתחת לקיפול מוסתר ומונפש.
    const rect = el.getBoundingClientRect();
    const inViewNow = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewNow) {
      setRevealed(true);
      return;
    }

    setRevealed(false);
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
