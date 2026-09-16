import {
  inferRoomKind,
  isBuildingCoreRoom,
  normFloorplanKey,
  type FloorplanBbox,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanVizViewId,
} from "@/lib/projects/floorplan-layout";

export type LocatorFocus = {
  /** האזור המדויק בחלל (מסומן במפת ההתמצאות) */
  highlight: FloorplanBbox | null;
  /** חיתוך רחב יותר מהתוכנית המקורית */
  crop: FloorplanBbox;
};

export function clampBbox(b: FloorplanBbox): FloorplanBbox {
  const x = Math.min(1, Math.max(0, b.x));
  const y = Math.min(1, Math.max(0, b.y));
  const w = Math.min(1 - x, Math.max(0.02, b.w));
  const h = Math.min(1 - y, Math.max(0.02, b.h));
  return { x, y, w, h };
}

export function expandBbox(b: FloorplanBbox, pad = 0.1): FloorplanBbox {
  return clampBbox({
    x: b.x - pad,
    y: b.y - pad,
    w: b.w + pad * 2,
    h: b.h + pad * 2,
  });
}

export function unionBboxes(boxes: FloorplanBbox[]): FloorplanBbox | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return clampBbox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
}

export function findRoomForLocator(layout: FloorplanLayout, roomName?: string): FloorplanRoom | undefined {
  if (!roomName?.trim()) return undefined;
  const stripped = roomName.replace(/^פנים\s*[—–-]\s*/u, "").trim();
  const key = normFloorplanKey(stripped);
  if (!key) return undefined;
  return (
    layout.rooms.find((r) => normFloorplanKey(r.name) === key) ??
    layout.rooms.find((r) => {
      const n = normFloorplanKey(r.name);
      return n.includes(key) || key.includes(n);
    })
  );
}

const FULL: FloorplanBbox = { x: 0, y: 0, w: 1, h: 1 };

/** ריפוד צר יותר לייצור פנים — בלי רצועת מרפסת 0.64 שגוררת דלת הזזה */
export function interiorCropPad(kind?: FloorplanRoom["kind"] | string): number {
  if (kind === "bedroom" || kind === "mmd") return 0.035;
  if (kind === "bathroom") return 0.05;
  if (kind === "kitchen") return 0.06;
  return 0.08;
}

/** אזור בתוכנית המקורית שמתאים להדמיה */
export function locatorFocusForView(
  layout: FloorplanLayout,
  viewId: FloorplanVizViewId,
  roomName?: string,
): LocatorFocus {
  if (viewId === "interior") {
    const room = findRoomForLocator(layout, roomName);
    if (room?.bbox) {
      return { highlight: clampBbox(room.bbox), crop: expandBbox(room.bbox, 0.12) };
    }
  }
  const union = unionBboxes(layout.rooms.map((r) => r.bbox).filter((b): b is FloorplanBbox => b != null));
  if (union) {
    return { highlight: union, crop: expandBbox(union, 0.06) };
  }
  return { highlight: null, crop: FULL };
}

/** חיתוך לייצור פנים — רק החלל הזה, בלי שכנים */
export function locatorFocusForGeneration(
  layout: FloorplanLayout,
  viewId: FloorplanVizViewId,
  roomName?: string,
): LocatorFocus {
  if (viewId !== "interior") return locatorFocusForView(layout, viewId, roomName);
  const room = findRoomForLocator(layout, roomName);
  if (!room?.bbox) return locatorFocusForView(layout, viewId, roomName);
  const kind = room.kind ?? inferRoomKind(room.name);
  return { highlight: clampBbox(room.bbox), crop: expandBbox(room.bbox, interiorCropPad(kind)) };
}

const TITLE_BLOCK_CROP: FloorplanBbox = { x: 0, y: 0, w: 0.74, h: 1 };

/**
 * Rooms on a floor plan tile the plane — they sit beside each other, they do not
 * nest. So heavy pairwise overlap, or a room the extractor could not place at
 * all, means the boxes are guesses rather than measurements, and cropping to
 * their union would cut through the apartment.
 *
 * Seen on דירה 18: seven rooms, one with no bbox, a bathroom sitting entirely
 * inside a balcony, overlap running 27% of the union area. The union stopped at
 * x=0.72 and the crop took the right-hand bedroom and both terraces off the
 * sheet, so the image model never saw them. A trustworthy read of the same
 * shape (sales-28-1) overlaps 5%, with every room placed.
 */
export function isTrustworthyRoomGeometry(layout: FloorplanLayout): boolean {
  const rooms = layout.rooms.filter((room) => !isBuildingCoreRoom(room));
  if (rooms.length < 3) return false;
  if (rooms.some((room) => !room.bbox)) return false;

  const boxes = rooms.map((room) => room.bbox!);
  const union = unionBboxes(boxes);
  if (!union) return false;
  const unionArea = Math.max(union.w, 0) * Math.max(union.h, 0);
  if (unionArea <= 0) return false;

  let overlap = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 0 && h > 0) overlap += w * h;
    }
  }
  return overlap / unionArea <= 0.15;
}

/** חיתוך לדירה בלבד — בלי בלוק כותרות ימני של תוכנית מכר */
export function unitCropFromLayout(
  layout: FloorplanLayout,
  options?: { portraitSheet?: boolean },
): FloorplanBbox {
  const boxes = layout.rooms
    .filter((room) => room.bbox && !isBuildingCoreRoom(room))
    .map((room) => room.bbox!);
  const union = unionBboxes(boxes);
  // Cropping away a title block is worth a little; cropping away a bedroom is
  // not recoverable, so an untrustworthy read keeps the whole sheet.
  if (union && union.w >= 0.2 && union.h >= 0.2 && isTrustworthyRoomGeometry(layout)) {
    return expandBbox(union, 0.05);
  }
  if (options?.portraitSheet) return TITLE_BLOCK_CROP;
  return FULL;
}

export function remapBboxToCrop(bbox: FloorplanBbox, crop: FloorplanBbox): FloorplanBbox {
  const cw = Math.max(crop.w, 0.02);
  const ch = Math.max(crop.h, 0.02);
  return clampBbox({
    x: (bbox.x - crop.x) / cw,
    y: (bbox.y - crop.y) / ch,
    w: bbox.w / cw,
    h: bbox.h / ch,
  });
}

/** אחרי חיתוך הסריקה — bbox-ים חייבים לעבור לאותה מערכת צירים */
export function remapLayoutToCrop(layout: FloorplanLayout, crop: FloorplanBbox): FloorplanLayout {
  if (crop.w >= 0.97 && crop.h >= 0.97 && crop.x <= 0.02 && crop.y <= 0.02) return layout;
  const mapBox = (bbox: FloorplanBbox) => remapBboxToCrop(bbox, crop);
  return {
    ...layout,
    rooms: layout.rooms.map((room) => (room.bbox ? { ...room, bbox: mapBox(room.bbox) } : room)),
    internalStairs: layout.internalStairs?.bbox
      ? { ...layout.internalStairs, bbox: mapBox(layout.internalStairs.bbox) }
      : layout.internalStairs,
  };
}
