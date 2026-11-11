"use client";

import type { StudioCamera } from "@/lib/projects/pipeline/flat-studio";
import type { FlatScene } from "@/lib/projects/scene3d/types";

/**
 * The flat's rooms from above, north up as the sheet draws it (x right, z down), with every camera standing where it
 * stands and looking where it looks. Clicking one stands the 3D view there.
 */
export function PlanLocator({
  scene,
  cameras,
  active,
  onPick,
  label,
}: {
  scene: FlatScene;
  cameras: StudioCamera[];
  active: string | null;
  onPick: (id: string) => void;
  label: string;
}) {
  const e = scene.extent;
  const pad = 0.6;
  const view = `${e.x - pad} ${e.z - pad} ${e.width + pad * 2} ${e.depth + pad * 2}`;
  const s = Math.max(e.width, e.depth) / 60;
  return (
    <svg viewBox={view} className="h-auto w-full" role="img" aria-label={label}>
      {scene.rooms.map((r) =>
        r.rects.map((q, i) => (
          <rect
            key={`${r.id}-${i}`}
            x={q.x}
            y={q.z}
            width={q.w}
            height={q.d}
            fill={r.kind === "balcony" ? "var(--vmb-bg-sunk)" : "var(--vmb-bg-raised)"}
            stroke="var(--vmb-line-strong)"
            strokeWidth={s * 0.4}
          />
        )),
      )}
      {scene.meshes
        .filter((m) => m.kind === "wall")
        .map((m, i) => (
          <rect
            key={i}
            x={m.centre.x - m.size.x / 2}
            y={m.centre.z - m.size.z / 2}
            width={m.size.x}
            height={m.size.z}
            fill="var(--vmb-ink)"
            opacity={0.75}
            transform={m.rotY ? `rotate(${(-m.rotY * 180) / Math.PI} ${m.centre.x} ${m.centre.z})` : undefined}
          />
        ))}
      {cameras
        .filter((c) => !c.top)
        .map((c) => {
          const dx = c.target.x - c.position.x;
          const dz = c.target.z - c.position.z;
          const L = Math.hypot(dx, dz) || 1;
          const on = c.id === active;
          const colour = c.client ? "var(--vmb-measure)" : "var(--vmb-accent)";
          return (
            <g key={c.id} role="button" tabIndex={0} aria-label={c.title} className="cursor-pointer" onClick={() => onPick(c.id)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onPick(c.id)}>
              <line x1={c.position.x} y1={c.position.z} x2={c.position.x + (dx / L) * s * 5} y2={c.position.z + (dz / L) * s * 5} stroke={colour} strokeWidth={s * (on ? 1.1 : 0.7)} strokeLinecap="round" />
              <circle cx={c.position.x} cy={c.position.z} r={s * (on ? 1.9 : 1.4)} fill={colour} stroke="var(--vmb-bg)" strokeWidth={s * 0.4} />
            </g>
          );
        })}
    </svg>
  );
}
