"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type SliderChip = { top: string; left: string; text: string };

type Props = {
  src: string;
  alt: string;
  sheetLabel: string;
  renderLabel: string;
  chips?: SliderChip[];
  /** Start position of the divider, % from the left. */
  start?: number;
  priority?: boolean;
};

/**
 * One frame, two states: the left part is the frame as a blueprint, the right
 * part the painted render. The divider sweeps slowly until the visitor drags it
 * (pointer or keyboard). Dimension chips sit on both halves so the eye sees they line up.
 */
export function SheetRenderSlider({ src, alt, sheetLabel, renderLabel, chips = [], start = 46, priority = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(start);
  const [drag, setDrag] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      setPos(start + Math.sin((t - t0) / 2800) * 15);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [touched, start]);

  const move = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(96, Math.max(4, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-pan-y select-none"
      onPointerDown={(e) => {
        setTouched(true);
        setDrag(true);
        move(e.clientX);
      }}
      onPointerMove={(e) => drag && move(e.clientX)}
      onPointerUp={() => setDrag(false)}
      onPointerLeave={() => setDrag(false)}
    >
      <Image src={src} alt={alt} fill priority={priority} sizes="100vw" className="vmb-kenburns object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} aria-hidden>
        <Image
          src={src}
          alt=""
          fill
          sizes="100vw"
          className="vmb-kenburns object-cover"
          style={{ filter: "grayscale(1) contrast(2.4) brightness(1.15) invert(1)" }}
        />
        <div className="absolute inset-0 bg-[#0a2a52] mix-blend-multiply" />
        <div className="vmb-grid absolute inset-0 opacity-90" style={{ ["--vmb-grid" as string]: "rgba(140,200,255,.18)" }} />
      </div>
      {chips.map((c) => (
        <span key={c.text} className="vmb-chip pointer-events-none absolute" style={{ top: c.top, left: c.left }}>
          {c.text}
        </span>
      ))}
      <div className="absolute inset-y-0 w-px bg-white/80 shadow-[0_0_24px_rgba(255,255,255,.7)]" style={{ left: `${pos}%` }}>
        <button
          type="button"
          role="slider"
          aria-label={`${sheetLabel} / ${renderLabel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setTouched(true);
            setPos((p) => Math.min(96, Math.max(4, p + (e.key === "ArrowRight" ? 4 : -4))));
          }}
          className="absolute top-1/2 left-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-white/70 bg-black/40 text-white backdrop-blur-md focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
        >
          <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M6 1 1 6l5 5M16 1l5 5-5 5" />
          </svg>
        </button>
        <span className="absolute top-24 right-3 text-[11px] font-medium tracking-[.25em] whitespace-nowrap text-white/80">{sheetLabel}</span>
        <span className="absolute top-24 left-3 text-[11px] font-medium tracking-[.25em] whitespace-nowrap text-white/80">{renderLabel}</span>
      </div>
    </div>
  );
}
