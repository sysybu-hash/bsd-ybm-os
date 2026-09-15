"use client";

import React from "react";
import {
  inferRoomKind,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import FloorplanVizAttemptCard from "@/components/os/widgets/floorplan-viz/FloorplanVizAttemptCard";
import type { FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";
import { groupFloorplanVizAttempts } from "@/lib/projects/floorplan-viz-ids";

export type TFn = (key: string, vars?: Record<string, string>) => string;

export function sourceLabel(t: TFn, source?: string): string {
  if (source === "ocr_verified") return t("projectDashboard.vizOcrVerified");
  if (source === "consensus") return t("projectDashboard.vizConsensus");
  return t("projectDashboard.vizInferred");
}

export function MeasuredPlanSvg({ rooms }: { rooms: FloorplanRoom[] }) {
  const boxed = rooms.filter((r) => r.bbox);
  if (boxed.length === 0) return null;
  const KIND_FILL: Record<string, string> = {
    living: "#fde68a",
    kitchen: "#fdba74",
    bedroom: "#93c5fd",
    mmd: "#c4b5fd",
    bathroom: "#67e8f9",
    balcony: "#86efac",
    circulation: "#cbd5e1",
    utility: "#d6d3d1",
    other: "#e2e8f0",
  };
  return (
    <svg viewBox="0 0 100 70" className="mt-2 h-auto w-full max-h-48 rounded-lg bg-[color:var(--surface-soft)]" role="img">
      {boxed.map((room) => {
        const b = room.bbox!;
        const kind = room.kind ?? inferRoomKind(room.name);
        return (
          <g key={`${room.name}-${room.instanceIndex ?? 0}`}>
            <rect
              x={b.x * 100}
              y={b.y * 70}
              width={Math.max(1, b.w * 100)}
              height={Math.max(1, b.h * 70)}
              fill={KIND_FILL[kind] ?? KIND_FILL.other}
              stroke="#334155"
              strokeWidth="0.4"
            />
            <text
              x={b.x * 100 + (b.w * 100) / 2}
              y={b.y * 70 + (b.h * 70) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="2.4"
              fill="#0f172a"
            >
              {room.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Gallery({
  title,
  groups,
  offset,
  onOpen,
  t,
  layout,
  planSrc,
  canManage,
  editingKey,
  onEdit,
  onImprove,
  onRescan,
  onDelete,
  onSelect,
}: {
  title: string;
  groups: ReturnType<typeof groupFloorplanVizAttempts>;
  offset: number;
  onOpen: (groupIndex: number, img: FloorplanVizImage) => void;
  t: TFn;
  layout: FloorplanLayout | null;
  planSrc: string | null;
  canManage?: boolean;
  editingKey?: string | null;
  onEdit?: (img: FloorplanVizImage, instruction: string, region?: FloorplanVizEditRegion) => void;
  onImprove?: (img: FloorplanVizImage, failures: string[]) => void;
  onRescan?: (img: FloorplanVizImage) => void;
  onDelete?: (img: FloorplanVizImage) => void;
  onSelect?: (img: FloorplanVizImage) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group, i) => (
            <FloorplanVizAttemptCard
              key={group.key}
              group={group}
              globalIndex={offset + i}
              onOpen={(img) => onOpen(offset + i, img)}
              t={t}
              layout={layout}
              planSrc={planSrc}
              canManage={canManage}
              editing={group.attempts.some((row) => (row.id ?? group.key) === editingKey)}
              onEdit={onEdit}
              onImprove={onImprove}
              onRescan={onRescan}
              onDelete={onDelete}
              onSelect={onSelect}
            />
        ))}
      </div>
    </section>
  );
}
