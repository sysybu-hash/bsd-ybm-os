import { inferRoomKind, isBuildingCoreRoom, isElevationFloorToken, layoutHasInternalStairs, type FloorplanLayout, type FloorplanRoom, type FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
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

const KIND_BRIEF_HE: Record<FloorplanRoomKind, string> = {
  living: "חלל מגורים — ישיבה ואירוח. הריהוט לקנה־מידה בלבד.",
  kitchen: "מטבח — משטח עבודה ואחסון לפי התוכנית.",
  bedroom: "חדר שינה — חלל פרטי סגור, עם מיטה לקנה־מידה.",
  mmd: 'ממ"ד — מרחב מוגן סגור ונפרד משאר הדירה.',
  bathroom: "חדר רחצה — אזור רטוב לפי התוכנית, לא חלל מגורים.",
  balcony: "מרפסת — חלל חיצוני רק אם סומן בתוכנית.",
  circulation: "גרעין תנועה — מדרגות בניין או מעלית. מדרגות פנים של הדירה הן גרם לקומה אחרת של אותה יחידה.",
  utility: "חלל שירות — מחסן, כביסה או חניה.",
  other: "חלל שזוהה בתוכנית — חדר עבודה הוא משרד עם שולחנות, לא מטבח.",
};

export function formatRoomMeasure(room: FloorplanRoom): string {
  if (room.widthM && room.lengthM) return `${room.widthM}×${room.lengthM} מ'`;
  if (room.areaM2) return `${room.areaM2} מ"ר`;
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

/** הסבר ראשי על כל התוכנית — עמוד הפתיחה של החוברת */
export function buildPlanOverviewCopy(
  layout: FloorplanLayout,
  projectName?: string,
  style?: { labelHe?: string; summaryHe?: string },
): string[] {
  const rooms = layout.rooms.filter((r) => !isBuildingCoreRoom(r));
  const unit =
    uniqueHeadingParts([layout.title, layout.unitLabel, projectName]) || "דירה לפי תוכנית מכר";
  const area = layout.grossAreaM2 ? `שטח ברוטו כ־${layout.grossAreaM2} מ"ר` : "שטח ברוטו לא אומת מהתוכנית";
  const floor = formatFloorLabel(layout.floor);
  const ceil = layout.ceilingHeightM ? `גובה תקרה ${layout.ceilingHeightM} מ'` : null;
  const north = layout.north ? `כיוון צפון: ${layout.north}` : null;
  const meta = [area, floor, ceil, north].filter(Boolean).join(" · ");
  const mix = rooms.length > 0 ? countByKind(rooms) : "לא חולצו חללים מאומתים";
  const styleLine =
    style?.labelHe
      ? `סגנון הדמיה: ${style.labelHe}${style.summaryHe ? ` — ${style.summaryHe}` : ""}.`
      : null;
  const fromE = layout.internalStairs?.fromElevationM;
  const toE = layout.internalStairs?.toElevationM;
  const fmtE = (n: number) => (Math.abs(n) < 0.005 ? "±0.00" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`);
  const stairLine = layoutHasInternalStairs(layout)
    ? fromE != null && toE != null && toE - fromE >= 0.8
      ? `זוהו מדרגות פנים לקומה אחרת של אותה דירה (${fmtE(fromE)} → ${fmtE(toE)}). אין לשטח את הדירה לקומה אחת.`
      : "זוהו מדרגות פנים לקומה אחרת של אותה דירה. אין לשטח את הדירה לקומה אחת."
    : null;

  return [
    `חוברת הדמיות תלת־ממד של ${unit}. ${meta}.`,
    rooms.length > 0
      ? `לפי הפענוח יש ${rooms.length} חללים: ${mix}.`
      : "לא זוהו חללים ברורים — יש לאמת מול הגרמושקה המקורית.",
    stairLine,
    styleLine,
    "כל עמוד מציג הדמיה אחת והאזור המתאים בתוכנית המקורית. הריהוט לקנה־מידה בלבד. אין למדוד מהתמונה.",
    "הופק במערכת BSD-YBM. ההדמיות להמחשה בלבד — אינן תחליף לתוכנית אדריכלית חתומה או להיתר.",
  ].filter((p): p is string => Boolean(p));
}

export function buildViewCaption(
  image: Pick<FloorplanVizImage, "viewId" | "labelHe" | "roomName">,
  layout: FloorplanLayout,
): string {
  const rooms = layout.rooms;
  if (image.viewId === "overview") {
    return layoutHasInternalStairs(layout)
      ? "מבט על של הדירה לפי התוכנית, כולל מדרגות פנים לקומה אחרת. הקירות חתוכים. אין למדוד מהתמונה."
      : "מבט על של הדירה כולה לפי התוכנית המצורפת. הקירות חתוכים כדי שכל חלל יישאר במקומו. אין למדוד מהתמונה.";
  }
  if (image.viewId === "isometric") {
    return "מבט איזומטרי של אותה דירה, באותה אוריינטציה כמו בתוכנית. בלי אגפים או חללים שלא סומנו בגרמושקה.";
  }

  const focus = image.roomName ?? image.labelHe.replace(/^פנים\s*[—–-]\s*/, "");
  const room = rooms.find((r) => r.name === focus);
  const kind = room?.kind ?? inferRoomKind(focus);
  const measure = room && room.widthM && room.lengthM ? formatRoomMeasure(room) : room?.areaM2 ? `${room.areaM2} מ"ר` : null;
  const bits = [
    `פנים בחלל ${focus} (${KIND_LABEL_HE[kind]}).`,
    KIND_BRIEF_HE[kind],
    measure ? `מידות: ${measure}.` : "",
  ];
  return bits.filter(Boolean).join(" ");
}
