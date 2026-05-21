import { XMLParser } from "fast-xml-parser";

export type ImportedScheduleTask = {
  externalTaskId: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  outlineLevel: number;
  parentExternalId: string | null;
};

function parseMsDate(v: unknown): Date | null {
  if (v == null) return null;
  const s = String(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseMsProjectXml(xml: string): ImportedScheduleTask[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const project = (doc.Project ?? doc.project) as Record<string, unknown> | undefined;
  if (!project) return [];

  const tasksRaw = project.Tasks as Record<string, unknown> | undefined;
  const taskNodes = asArray(
    (tasksRaw?.Task ?? tasksRaw?.task) as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );

  const out: ImportedScheduleTask[] = [];
  const stack: string[] = [];

  for (const t of taskNodes) {
    const uid = String(t["@_UID"] ?? t.UID ?? t["@_ID"] ?? t.ID ?? "");
    if (!uid || uid === "0") continue;

    const name = String(t.Name ?? t.name ?? "משימה");
    const outline = Number(t["@_OutlineLevel"] ?? t.OutlineLevel ?? 1);
    const percent = Number(t.PercentComplete ?? t.percentComplete ?? 0);
    const start = parseMsDate(t.Start ?? t.start);
    const finish = parseMsDate(t.Finish ?? t.finish);

    while (stack.length >= outline) stack.pop();
    const parentExternalId = stack.length ? stack[stack.length - 1]! : null;
    stack.push(uid);

    out.push({
      externalTaskId: uid,
      title: name,
      startDate: start,
      endDate: finish,
      progress: Math.min(100, Math.max(0, Math.round(percent))),
      outlineLevel: outline,
      parentExternalId,
    });
  }

  return out;
}

export function parseScheduleCsv(csvText: string): ImportedScheduleTask[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const titleI = idx(["name", "task", "title", "שם"]);
  const startI = idx(["start", "התחלה"]);
  const endI = idx(["finish", "end", "סיום"]);
  const progressI = idx(["% complete", "progress", "התקדמות"]);

  return lines.slice(1).map((line, i) => {
    const cols = line.split(",");
    const title = cols[titleI >= 0 ? titleI : 0]?.trim() || `משימה ${i + 1}`;
    const start = startI >= 0 ? parseMsDate(cols[startI]) : null;
    const end = endI >= 0 ? parseMsDate(cols[endI]) : null;
    const progress = progressI >= 0 ? Number(cols[progressI]) || 0 : 0;
    return {
      externalTaskId: `csv-${i + 1}`,
      title,
      startDate: start,
      endDate: end,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      outlineLevel: 1,
      parentExternalId: null,
    };
  });
}
