"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode } from "react";

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
  const inView = useInView(ref, {
    once: true,
    amount: 0.12,
    margin: "0px 0px -48px 0px",
  });

  if (reduceMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  const visible = eager || inView;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 32 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
