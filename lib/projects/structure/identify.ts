import { storeyOf } from "@/lib/projects/building/dxf-house";
import { createLogger } from "@/lib/logger";
import { prepareFloorplanSource } from "@/lib/projects/photo-prep/source";
import {
  DWF_MIME,
  DWG_MIME,
  DXF_MIME,
  sniffFloorplanBytes,
} from "@/lib/projects/photo-prep/mime";
import { classifyStructure, type FileEvidence } from "@/lib/projects/structure/classify";
import { identifyDwf } from "@/lib/projects/structure/identify-dwf";
import { identifyDxf, type FileIdentification } from "@/lib/projects/structure/identify-dxf";
import { identifyPdf } from "@/lib/projects/structure/identify-pdf";
import type { StructureReport } from "@/lib/validation/schemas/floorplan-structure";

const log = createLogger("floorplan-structure");

export type IdentifyInput = { name: string; bytes: Buffer };

const FACADE_FILE = /facade|elevation|חזית|חזיתות/i;
const empty = (fileKind: FileEvidence["fileKind"]): FileEvidence => ({
  fileKind,
  plans: [],
  storeySheets: 0,
  facadeSheets: 0,
  numberedFloorSheets: 0,
  houseSheets: 0,
});

async function identifyOne(file: IdentifyInput): Promise<FileIdentification & { kind: StructureReport["file"]["kind"]; dwfUnits?: StructureReport["dwfUnits"] }> {
  const mime = sniffFloorplanBytes(file.bytes.subarray(0, 6144).toString("base64")) ??
    (/\.dxf$/i.test(file.name) ? DXF_MIME : /\.(dwf|w2d)$/i.test(file.name) ? DWF_MIME : /\.dwg$/i.test(file.name) ? DWG_MIME : null);
  if (mime === DXF_MIME) return { kind: "dxf", ...(await identifyDxf(file.bytes)) };
  if (mime === DWF_MIME) {
    const read = await identifyDwf(file.bytes);
    return { kind: "dwf", ...read };
  }
  if (mime === "application/pdf") return { kind: "pdf", ...(await identifyPdf(file.bytes)) };
  if (mime === DWG_MIME) {
    // A DWG is read only after it is converted, which is a paid service; the
    // identify step does not convert. The person picks the structure.
    return {
      kind: "dwg",
      evidence: empty("dwg"),
      plans: [],
      units: { metresPerUnit: null, from: "unknown" },
      unread: ["קובץ DWG נקרא רק אחרי המרה ל־DXF, בשלב ההפקה. לזיהוי מלא — ייצאו DXF מתוכנת ה־CAD."],
    };
  }
  const prepared = await prepareFloorplanSource(file.bytes.toString("base64"), mime ?? "image/jpeg");
  return {
    kind: "image",
    evidence: { ...empty("image"), photo: prepared.sourceKind === "photo" },
    plans: [],
    units: { metresPerUnit: null, from: "unknown" },
    unread: [],
  };
}

/**
 * What an upload is, from the files themselves and nothing paid: the plans
 * each holds with previews, what kind of structure they make, how sure that
 * is, and what was not read. Several files are one house's sheets — a file a
 * storey, a file of facades — named as an architect names them.
 */
export async function identifyStructure(files: IdentifyInput[]): Promise<StructureReport> {
  if (files.length === 0) throw new Error("no files");
  const reads = [];
  for (const file of files) reads.push({ file, read: await identifyOne(file) });

  const many = reads.length > 1;
  const evidence: FileEvidence = many ? empty("files") : reads[0]!.read.evidence;
  const plans: StructureReport["plans"] = [];
  const unread: string[] = [];
  for (const { file, read } of reads) {
    const prefix = many ? `file:${file.name}:` : "";
    for (const plan of read.plans) plans.push({ ...plan, id: prefix + plan.id, ...(many && !plan.title ? { title: file.name } : {}) });
    unread.push(...read.unread.map((line) => (many ? `${file.name}: ${line}` : line)));
    if (!many) continue;
    evidence.plans.push(...read.evidence.plans.map((p) => ({ ...p, id: prefix + p.id })));
    evidence.numberedFloorSheets += read.evidence.numberedFloorSheets;
    evidence.houseSheets += read.evidence.houseSheets;
    evidence.storeySheets += read.evidence.storeySheets + (storeyOf(file.name) != null ? 1 : 0);
    evidence.facadeSheets += read.evidence.facadeSheets + (FACADE_FILE.test(file.name) ? 1 : 0);
  }
  if (!many && reads[0]!.read.kind === "dwg") {
    return {
      file: { kind: "dwg", name: files[0]!.name, bytes: files[0]!.bytes.length },
      units: { metresPerUnit: null, from: "unknown" },
      structure: "unknown",
      sure: false,
      reasons: ["קובץ DWG — הסוג נבחר ידנית"],
      plans: [],
      unread,
      blockers: [],
    };
  }

  const verdict = classifyStructure(evidence);
  const first = reads[0]!.read;
  const report: StructureReport = {
    file: {
      kind: many ? "files" : first.kind,
      name: many ? files.map((f) => f.name).join(", ").slice(0, 400) : files[0]!.name,
      bytes: files.reduce((n, f) => n + f.bytes.length, 0),
    },
    units: first.units,
    structure: verdict.structure,
    sure: verdict.sure,
    reasons: verdict.reasons.slice(0, 20),
    plans: plans.slice(0, 60).map((p) => {
      const blocked = verdict.blockedPlans.get(p.id);
      return blocked ? { ...p, blocked } : p;
    }),
    ...(first.dwfUnits?.length ? { dwfUnits: first.dwfUnits } : {}),
    unread: unread.slice(0, 30),
    blockers: verdict.blockers,
  };
  log.info("structure identified", {
    file: report.file.kind,
    structure: report.structure,
    sure: report.sure,
    plans: report.plans.length,
    blocked: verdict.blockedPlans.size,
    blockers: report.blockers.length,
  });
  return report;
}
