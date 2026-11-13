"use client";

import { useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { HeroScene } from "@/components/vmb/landing/hero-tower-scene";

const log = createLogger("vmb-hero");

export type HeroChip = { top: string; left: string; text: string };

type Props = {
  sheetLabel: string;
  renderLabel: string;
  /** Said under the frame: this is an illustration, not a client's project. */
  note: string;
  chips?: HeroChip[];
};

/** One pass from sheet to lit city, then a hold on the finished frame before it starts again. */
const RUN_S = 15;
const HOLD_S = 6;

/**
 * The landing hero: a drawing that rises into a tower and a lit city (hero-tower-scene.ts). It plays by itself until the
 * visitor takes the slider, which then scrubs between "sheet" and "render". Under it stands a plain dusk backdrop, which
 * is all there is without WebGL; with reduced motion the finished frame is drawn once and stays.
 */
export function HeroTower({ sheetLabel, renderLabel, note, chips = [] }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const level = useRef<HTMLSpanElement>(null);
  const sky = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const held = useRef<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let scene: HeroScene | null = null;
    let skyAt: (p: number) => number = () => 0;
    let raf = 0;
    let gone = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();

    const size = () => scene?.resize(el.clientWidth, el.clientHeight);
    const frame = (now: number) => {
      if (!scene) return;
      const seconds = (now - t0) / 1000;
      const auto = Math.min(1, (seconds % (RUN_S + HOLD_S)) / RUN_S);
      const p = still ? 1 : (held.current ?? auto);
      scene.update(p, still ? 0 : seconds);
      // The sheet's blue gives way to the evening sky as the city grows.
      if (sky.current) sky.current.style.opacity = String(skyAt(p));
      if (level.current) level.current.textContent = `+${scene.heightAt(p).toFixed(2)} m`;
      if (range.current && held.current == null) range.current.value = String(Math.round(p * 1000));
      if (!still) raf = requestAnimationFrame(frame);
    };

    const start = async () => {
      try {
        const [T, { createHeroScene, stage, STAGES }] = await Promise.all([import("three"), import("@/components/vmb/landing/hero-tower-scene")]);
        if (gone) return;
        scene = createHeroScene(T, el);
        skyAt = (p) => stage(p, STAGES.city[0], STAGES.city[1]);
        size();
        setLive(true);
        raf = requestAnimationFrame(frame);
      } catch (err: unknown) {
        // No WebGL (or it was refused): the backdrop stays, and the page loses nothing it needs.
        log.warn("hero scene not started", { error: err instanceof Error ? err.message : String(err) });
        scene = null;
        if (sky.current) sky.current.style.opacity = "0.7";
      }
    };
    // After the page has painted: the scene must never hold back the headline.
    const idle = window.setTimeout(() => void start(), 300);
    window.addEventListener("resize", size);
    return () => {
      gone = true;
      window.clearTimeout(idle);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      scene?.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden select-none">
      <div className="absolute inset-0 bg-[#0a2a52]" />
      <div className="vmb-grid absolute inset-0 opacity-90" style={{ ["--vmb-grid" as string]: "rgba(140,200,255,.16)" }} />
      <div ref={sky} className="absolute inset-0 bg-[linear-gradient(180deg,#141a33_0%,#3b2f55_34%,#b9654a_58%,#f0a765_72%,#f0a765_100%)]" style={{ opacity: 0 }} />
      <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${live ? "opacity-100" : "opacity-0"}`} aria-hidden />
      {chips.map((c) => (
        <span key={c.text} className="vmb-chip pointer-events-none absolute" style={{ top: c.top, left: c.left }}>
          {c.text}
        </span>
      ))}
      <span ref={level} className="vmb-chip pointer-events-none absolute top-[22%] left-[62%]" dir="ltr">
        +0.00 m
      </span>
      {live ? (
        <div className="absolute inset-x-0 top-24 z-10 mx-auto flex w-[min(92%,34rem)] items-center gap-3 text-[11px] font-medium tracking-[.2em] text-white/80" dir="ltr">
          <span>{sheetLabel}</span>
          <input
            ref={range}
            type="range"
            min={0}
            max={1000}
            defaultValue={0}
            aria-label={`${sheetLabel} / ${renderLabel}`}
            onInput={(e) => {
              held.current = Number(e.currentTarget.value) / 1000;
            }}
            className="vmb-range min-w-0 flex-1"
          />
          <span>{renderLabel}</span>
        </div>
      ) : null}
      <p className="pointer-events-none absolute inset-x-0 top-[8.4rem] z-10 text-center text-[10px] tracking-wide text-white/60">{note}</p>
    </div>
  );
}
