import type { RoomRect, WallRun } from "@/lib/projects/floorplan-rooms";

/**
 * Draws the plan from measured geometry.
 *
 * Every wall here is a coordinate out of the CAD file and every dimension is the
 * printed one, so the same sheet renders identically every time. That is the
 * whole point of this path: the generative stills were re-rolling the floor
 * plate on each attempt, and no amount of prompting settled it.
 */

const KIND_FILL: Record<string, string> = {
  living: "#f3ede1",
  kitchen: "#eae3d4",
  bedroom: "#f6f1e8",
  mmd: "#e8e4dc",
  bathroom: "#e4ecee",
  balcony: "#eef1e9",
  circulation: "#f4f2ee",
  utility: "#eeeae4",
  other: "#f4f1ec",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type FloorplanSvgOptions = {
  /** Wall stroke in page units. */
  wallWidth?: number;
  showDimensions?: boolean;
  title?: string;
};

export function renderFloorplanSvg(
  rooms: RoomRect[],
  walls: WallRun[],
  page: { width: number; height: number },
  options?: FloorplanSvgOptions,
): string {
  const wallWidth = options?.wallWidth ?? 3;
  const pad = 16;
  const W = Math.round(page.width + pad * 2);
  const H = Math.round(page.height + pad * 2);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<g transform="translate(${pad} ${pad})">`,
  ];

  for (const room of rooms) {
    const fill = KIND_FILL[room.kind ?? "other"] ?? KIND_FILL.other;
    parts.push(
      `<rect x="${room.x.toFixed(1)}" y="${room.y.toFixed(1)}" width="${room.w.toFixed(1)}" height="${room.h.toFixed(1)}" fill="${fill}"/>`,
    );
  }

  parts.push(`<g stroke="#1c1c1c" stroke-width="${wallWidth}" stroke-linecap="square">`);
  for (const run of walls) {
    const line =
      run.orientation === "h"
        ? `<line x1="${run.from.toFixed(1)}" y1="${run.at.toFixed(1)}" x2="${run.to.toFixed(1)}" y2="${run.at.toFixed(1)}"/>`
        : `<line x1="${run.at.toFixed(1)}" y1="${run.from.toFixed(1)}" x2="${run.at.toFixed(1)}" y2="${run.to.toFixed(1)}"/>`;
    parts.push(line);
  }
  parts.push(`</g>`);

  for (const room of rooms) {
    if (!room.name) continue;
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    // Hebrew labels: the plan is RTL, and the renderer draws text unshaped, so
    // the label is centred and left to the font's own bidi handling.
    const size = Math.max(7, Math.min(13, Math.min(room.w, room.h) / 5));
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${size.toFixed(1)}" fill="#20211f" text-anchor="middle" direction="rtl">${escapeXml(room.name)}</text>`,
    );
    if (options?.showDimensions && room.widthM && room.heightM) {
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${(cy + size * 1.25).toFixed(1)}" font-size="${(size * 0.8).toFixed(1)}" fill="#6a6a66" text-anchor="middle">${room.widthM.toFixed(2)} × ${room.heightM.toFixed(2)}</text>`,
      );
    }
  }

  parts.push(`</g></svg>`);
  return parts.join("");
}
