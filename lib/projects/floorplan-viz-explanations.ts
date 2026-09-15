import { extractUnitLabel, inferRoomKind, isBuildingCoreRoom, isElevationFloorToken, layoutHasInternalStairs, type FloorplanLayout, type FloorplanRoom, type FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";

export const KIND_LABEL_HE: Record<FloorplanRoomKind, string> = {
  living: "מגורים",
  kitchen: "מטבח",
  bedroom: "חדר שינה",
  mmd: 'ממ"ד',
  bathroom: "רחצה",
  balcony: "מרפסת",
  circulation: "גרעין / תנועה",
  utility: "שירות",
  other: "חלל אחר",
};

export function formatRoomMeasure(room: FloorplanRoom): string {
  if (room.widthM && room.lengthM) return `${room.widthM}×${room.lengthM} מ'`;
  return "—";
}

/** Area cell for the booklet table — separate from width×length. */
export function formatRoomArea(room: FloorplanRoom): string {
  if (room.areaM2 != null) return `${room.areaM2} מ"ר`;
  if (room.widthM && room.lengthM) {
    return `${Math.round(room.widthM * room.lengthM * 100) / 100} מ"ר`;
  }
  return "—";
}

export function formatFloorLabel(floor?: string): string | null {
  const raw = floor?.trim();
  if (!raw) return null;
  if (isElevationFloorToken(raw)) return null;
  return /קומה/u.test(raw) ? raw : `קומה ${raw}`;
}

export function uniqueHeadingParts(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const t = part?.trim();
    if (!t) continue;
    const key = t.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.join(" · ");
}

/** The unit the booklet is about — never the sheet's project / street title. */
export function bookletUnitHeading(layout: FloorplanLayout, fallback?: string): string {
  const found = extractUnitLabel(
    [layout.unitLabel, layout.title, fallback].filter((row): row is string => Boolean(row?.trim())).join(" "),
  );
  if (found) {
    const digits = found.replace(/^דירה\s*/u, "").trim();
    return digits ? `דירה ${digits}` : found;
  }
  const unit = layout.unitLabel?.trim();
  if (unit) {
    const digits = unit.replace(/^דירה\s*/u, "").trim();
    return digits ? `דירה ${digits}` : unit;
  }
  const fall = fallback?.trim();
  return fall || "דירה לפי תוכנית מכר";
}

function countByKind(rooms: FloorplanRoom[]): string {
  const counts = new Map<FloorplanRoomKind, number>();
  for (const room of rooms) {
    const kind = room.kind ?? inferRoomKind(room.name);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const order: FloorplanRoomKind[] = [
    "living",
    "kitchen",
    "bedroom",
    "mmd",
    "bathroom",
    "balcony",
    "circulation",
    "utility",
    "other",
  ];
  return order
    .filter((k) => (counts.get(k) ?? 0) > 0)
    .map((k) => `${KIND_LABEL_HE[k]} ×${counts.get(k)}`)
    .join(" · ");
}

/** טקסט פתיחה קצר לשער החוברת */
export function buildPlanOverviewCopy(
  layout: FloorplanLayout,
  projectName?: string,
  style?: { labelHe?: string; summaryHe?: string },
): string[] {
  const rooms = layout.rooms.filter((r) => !isBuildingCoreRoom(r));
  const unit = bookletUnitHeading(layout, projectName);
  const site =
    layout.title?.trim() &&
    !/^דירה\b/u.test(layout.title.trim()) &&
    layout.title.trim() !== unit
      ? layout.title.trim()
      : projectName && projectName !== unit
        ? projectName
        : null;
  const area = layout.grossAreaM2 ? `שטח ברוטו ${layout.grossAreaM2} מ"ר` : null;
  const floor = formatFloorLabel(layout.floor);
  const ceil = layout.ceilingHeightM ? `גובה תקרה ${layout.ceilingHeightM} מ'` : null;
  const north = layout.north ? `כיוון צפון: ${layout.north}` : null;
  const meta = [area, floor, ceil, north].filter(Boolean).join(" · ");
  const mix = rooms.length > 0 ? countByKind(rooms) : null;
  const styleLine =
    style?.labelHe
      ? `סגנון: ${style.labelHe}${style.summaryHe ? ` — ${style.summaryHe}` : ""}.`
      : null;
  const stairLine = layoutHasInternalStairs(layout) ? "דירת דופלקס עם מדרגות פנים." : null;

  return [
    `${unit}${site ? ` · ${site}` : ""}${meta ? `. ${meta}` : ""}.`,
    mix ? `חללי הדירה: ${mix}.` : null,
    stairLine,
    styleLine,
    "הדמיה תלת־ממד לפי תוכנית המכר. הריהוט להמחשה בלבד, ואינו תחליף לתוכנית אדריכלית חתומה.",
  ].filter((p): p is string => Boolean(p));
}

export function buildViewCaption(
  image: Pick<FloorplanVizImage, "viewId" | "labelHe" | "roomName">,
  layout: FloorplanLayout,
): string {
  const rooms = layout.rooms;
  if (image.viewId === "overview") {
    return layoutHasInternalStairs(layout)
      ? "מבט על לפי תוכנית המכר, כולל מדרגות פנים."
      : "מבט על לפי תוכנית המכר.";
  }
  if (image.viewId === "isometric") {
    return "מבט איזומטרי לפי תוכנית המכר.";
  }

  const focus = image.roomName ?? image.labelHe.replace(/^פנים\s*[—–-]\s*/, "");
  const room = rooms.find((r) => r.name === focus);
  const kind = room?.kind ?? inferRoomKind(focus);
  const measure = room && room.widthM && room.lengthM ? formatRoomMeasure(room) : room?.areaM2 ? `${room.areaM2} מ"ר` : null;
  const bits = [`${focus} · ${KIND_LABEL_HE[kind]}.`, measure ? `מידות ${measure}.` : ""];
  return bits.filter(Boolean).join(" ");
}
