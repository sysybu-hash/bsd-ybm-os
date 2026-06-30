"use client";

import React from "react";
import { motion } from "framer-motion";

const visualizerHeights = [10, 16, 8, 22, 14, 18, 9, 20, 12, 24, 11, 19, 15, 21, 8, 17];
const BOX = "div";

export type GeminiLiveVisualizerProps = {
  active: boolean;
  speaking: boolean;
  className?: string;
};

export default function GeminiLiveVisualizer({ active, speaking, className = "" }: GeminiLiveVisualizerProps) {
  if (!active) return null;

  return React.createElement(
    BOX,
    { className: `pointer-events-none overflow-hidden ${className}` },
    React.createElement(
      BOX,
      { className: "flex h-7 items-end justify-center gap-1 px-4" },
      visualizerHeights.map((height, i) =>
        React.createElement(motion.div, {
          key: `${height}-${i}`,
          animate: {
            height: speaking ? [4, height, 4] : [3, Math.max(6, height / 2), 3],
          },
          transition: {
            repeat: Infinity,
            duration: 0.65 + (i % 4) * 0.08,
            ease: [0.42, 0, 0.58, 1] as const,
          },
          className: `w-1 rounded-full ${speaking ? "bg-[color:var(--win-accent,#6366f1)]" : "bg-emerald-500/60"}`,
        }),
      ),
    ),
  );
}
