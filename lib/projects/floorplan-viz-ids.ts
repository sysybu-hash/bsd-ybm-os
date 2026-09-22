import type {
  FloorplanLayout,
  FloorplanVizImage,
  FloorplanVizStillOrigin,
  FloorplanVizViewId,
} from "@/lib/projects/floorplan-layout";

export function floorplanVizViewKey(viewId: string, roomName?: string | null): string {
  return `${viewId}:${roomName ?? ""}`;
}

export function parseFloorplanVizOrigin(raw: string | null | undefined): FloorplanVizStillOrigin {
  if (raw === "edit" || raw === "cad") return raw;
  return "generate";
}

export function stillSortOrder(viewId: string, roomName?: string | null, index = 0): number {
  if (viewId === "overview" && !roomName) return 0;
  if (viewId === "isometric") return 1;
  if (viewId === "overview") return 2;
  return 10 + index;
}

export type FloorplanVizAttemptGroup = {
  key: string;
  viewId: FloorplanVizViewId;
  roomName?: string;
  labelHe: string;
  attempts: FloorplanVizImage[];
};

export function groupFloorplanVizAttempts(images: FloorplanVizImage[]): FloorplanVizAttemptGroup[] {
  const order: Record<string, number> = { overview: 0, isometric: 1, interior: 2 };
  const map = new Map<string, FloorplanVizImage[]>();
  for (const img of images) {
    const key = floorplanVizViewKey(img.viewId, img.roomName);
    const list = map.get(key) ?? [];
    list.push(img);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, attempts]) => {
      const sorted = [...attempts].sort((a, b) => {
        const ai = a.attemptIndex ?? 0;
        const bi = b.attemptIndex ?? 0;
        if (ai !== bi) return ai - bi;
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      });
      const head = sorted[0]!;
      return {
        key,
        viewId: head.viewId,
        roomName: head.roomName,
        labelHe: head.labelHe,
        attempts: sorted,
      };
    })
    .sort((a, b) => {
      const d = (order[a.viewId] ?? 9) - (order[b.viewId] ?? 9);
      if (d !== 0) return d;
      return (a.roomName ?? "").localeCompare(b.roomName ?? "", "he");
    });
}

export function selectedFromAttemptGroup(group: FloorplanVizAttemptGroup): FloorplanVizImage {
  return group.attempts.find((row) => row.selected) ?? group.attempts[group.attempts.length - 1]!;
}

export function selectedFloorplanVizImages(images: FloorplanVizImage[]): FloorplanVizImage[] {
  return groupFloorplanVizAttempts(images).map(selectedFromAttemptGroup);
}

export function isFloorplanVizGeometryCompanion(
  img: Pick<FloorplanVizImage, "viewId" | "roomName">,
): boolean {
  return img.viewId === "overview" && img.roomName === "גיאומטריה";
}

/** Living overview only — geometry companions and interiors stay out of the sales booklet. */
export function bookletHeroImage(images: FloorplanVizImage[]): FloorplanVizImage | undefined {
  return (
    images.find((img) => img.viewId === "overview" && !img.roomName) ??
    images.find(
      (img) => img.viewId === "overview" && !isFloorplanVizGeometryCompanion(img),
    ) ??
    images.find((img) => img.viewId === "isometric") ??
    undefined
  );
}

export function replaceFloorplanVizAttempt(
  images: FloorplanVizImage[],
  incoming: FloorplanVizImage,
): FloorplanVizImage[] {
  const key = floorplanVizViewKey(incoming.viewId, incoming.roomName);
  const without = images.filter((row) => row.id !== incoming.id);
  const marked = without.map((row) =>
    floorplanVizViewKey(row.viewId, row.roomName) === key ? { ...row, selected: false } : row,
  );
  return [...marked, { ...incoming, selected: incoming.selected !== false }];
}

export function markFloorplanVizAttemptSelected(
  images: FloorplanVizImage[],
  stillId: string,
): FloorplanVizImage[] {
  const target = images.find((row) => row.id === stillId);
  if (!target) return images;
  const key = floorplanVizViewKey(target.viewId, target.roomName);
  return images.map((row) => ({
    ...row,
    selected: floorplanVizViewKey(row.viewId, row.roomName) === key ? row.id === stillId : row.selected,
  }));
}

export function floorplanVizStillFilePath(runId: string, stillId: string): string {
  return `/api/projects/visualize-floorplan/${encodeURIComponent(runId)}/stills/${encodeURIComponent(stillId)}/file`;
}

const AUDIT_ISSUES_MARKER = "@@auditIssues@@";

/** Persist audit hard-failures in editPrompt without a schema migration. */
export function packFloorplanVizStillMeta(img: Pick<FloorplanVizImage, "editPrompt" | "auditIssues">): string | null {
  const prompt = (img.editPrompt ?? "").trim();
  const cleanPrompt = prompt.includes(AUDIT_ISSUES_MARKER)
    ? prompt.slice(0, prompt.indexOf(AUDIT_ISSUES_MARKER)).trim()
    : prompt;
  const issues = img.auditIssues?.filter((row) => typeof row === "string" && row.trim()) ?? [];
  if (issues.length === 0) return cleanPrompt || null;
  const packed = `${AUDIT_ISSUES_MARKER}${JSON.stringify(issues)}`;
  return cleanPrompt ? `${cleanPrompt}\n${packed}` : packed;
}

export function unpackFloorplanVizStillMeta(raw: string | null | undefined): {
  editPrompt?: string;
  auditIssues?: string[];
} {
  if (!raw) return {};
  const idx = raw.indexOf(AUDIT_ISSUES_MARKER);
  if (idx < 0) return { editPrompt: raw };
  const before = raw.slice(0, idx).trim();
  try {
    const parsed: unknown = JSON.parse(raw.slice(idx + AUDIT_ISSUES_MARKER.length));
    if (Array.isArray(parsed) && parsed.every((row) => typeof row === "string")) {
      return {
        editPrompt: before || undefined,
        auditIssues: parsed.filter((row) => row.trim()),
      };
    }
  } catch {
    /* ignore corrupt pack */
  }
  return { editPrompt: before || raw };
}

/** Hebrew one-liner for a residual audit hard-failure (UI summary). */
export function hebrewFloorplanAuditIssue(failure: string): string {
  // Numbers, not a paraphrase: "a bedroom is missing" is the whole verdict.
  const bedrooms = /^bedrooms (\d+), plan has (\d+)/i.exec(failure.trim());
  if (bedrooms) return `בהדמיה ${bedrooms[1]} חדרי שינה, בתוכנית ${bedrooms[2]}`;
  const beds = /^beds (\d+), (?:plan has|the geometry draws) (\d+)/i.exec(failure.trim());
  if (beds) return `בהדמיה ${beds[1]} מיטות, בתוכנית ${beds[2]}`;
  if (/beds \d|bedrooms \d|plan has \d/i.test(failure)) return "מספר המיטות לא תואם לתוכנית";
  if (/front door missing/i.test(failure)) return "חסר פתח הכניסה לדלת הכניסה שבתוכנית";
  if (/stair flight/i.test(failure)) return "מדרגות מומצאות — הדירה במפלס אחד בלי מדרגות פנים";
  if (/terrace\(s\) invented/i.test(failure)) return "מרפסת/דק מומצאים — אין מרפסת במפלס הדירה";
  if (/printed terrace\(s\) missing/i.test(failure)) return "מרפסת מהתוכנית חסרה בהדמיה";
  if (/terrace\(s\) grown/i.test(failure)) return "מרפסת גדולה מדי / גג שנמשך למפלס הדירה";
  if (/room\(s\) invented outside/i.test(failure)) return "חללים מומצאים מחוץ לקו התוכנית";
  if (/letters or digits/i.test(failure)) return "יש כיתוב או מספרים בתוך התמונה";
  if (/CAD annotation/i.test(failure)) return "סימוני CAD דו־ממדיים נשארו בתמונה";
  if (/CAD block massing/i.test(failure)) return "נשלח לוח CAD במקום הדמיה פוטוריאליסטית";
  if (/double bed/i.test(failure)) return "מיטה זוגית בהדמיה חרדית";
  if (/screen/i.test(failure)) return "מסך/טלוויזיה בהדמיה חרדית";
  if (/mirrored/i.test(failure)) return "התמונה שיקוף של התוכנית";
  if (/turned \d+ degrees/i.test(failure)) return "התמונה מסובבת ביחס לתוכנית";
  if (/invented outside/i.test(failure)) return "חדרים מחוץ לקו התוכנית";
  if (/terrace\(s\) invented/i.test(failure)) return "מרפסת שלא קיימת בתוכנית";
  if (/terrace\(s\) furnished as indoor/i.test(failure)) return "מרפסת רוהטה כחדר פנים";
  if (/wet fixture/i.test(failure)) return "כלים סניטריים בחדר יבש";
  if (/washer\(s\) on a leisure|washers \d/i.test(failure)) {
    return "מכונות כביסה במקום הלא נכון / במספר לא תואם לתוכנית";
  }
  if (/bathtubs \d/i.test(failure)) return "אמבטיה שלא מסומנת בתוכנית (במקום מכונת כביסה)";
  if (/kitchen fridge missing/i.test(failure)) return "חסר מקרר במטבח למרות שמופיע בתוכנית";
  if (/stair/i.test(failure)) return "גרם מדרגות בתוך הדירה";
  return failure;
}

export function titleFromFloorplanLayout(layout: FloorplanLayout, fallback = "הדמיית תוכנית"): string {
  const label = (layout.unitLabel || layout.title || "").trim();
  return label || fallback;
}

export function parseFloorplanVizViewId(raw: string): FloorplanVizViewId {
  if (raw === "overview" || raw === "isometric" || raw === "interior") return raw;
  return "interior";
}

export type FloorplanVizRunSummary = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  styleLabelHe: string | null;
  scope: string;
  stillCount: number;
  thumbStillId: string | null;
  createdAt: string;
  updatedAt: string;
};
