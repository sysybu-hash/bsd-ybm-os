import { askDrawing } from "@/lib/projects/building/house-ai";

/**
 * Each sheet against its measured render, by the vision model: what the
 * drawing has that the render does not, or has elsewhere.
 *
 * A report, not a repair. The render is what the sheets measured; the model
 * only points at where the two may part, and the booklet says so. A finding
 * the model itself is unsure of is left out, and one a count the build made
 * contradicts is kept with that said beside it.
 */
export type HouseAuditFinding = { sheet: string; element: string; issue: "missing" | "extra" | "moved"; where: string; contradicted?: string };

export type AuditPair = { sheet: string; title: string; kind: "plan" | "elevation"; drawing: string; render: string };

const ELEMENTS = ["window", "door", "wall", "stairs", "parking", "car", "fence", "gate", "lawn", "roof", "balcony", "other"];

const AUDIT_PROMPT = (kind: "plan" | "elevation") => `The first picture is an architect's drawing of a private house in Israel — ${kind === "plan" ? "a floor plan, seen from above" : "an elevation, the house seen square-on from one side"}. The second picture is a 3D render built automatically from that drawing and framed about the same way.
List only real differences a client would notice: an element the drawing has that the render is missing, an element the render has that the drawing does not, or an element in a clearly different place. Elements: window, door, wall, stairs, parking, car, fence, gate, lawn, roof, balcony, other.
Ignore colours, materials, furniture style, light and shadow, line weights, text, dimension lines, level marks and hatching, and small framing offsets.
"where" is a short description in Hebrew of where on the drawing the difference is.
Answer JSON only: {"findings":[{"element":"window","issue":"missing","where":"קומה א, חזית שמאל","confidence":0.8}]}  — an empty list if they match.`;

/**
 * What the build made, to check findings against: the cars in its bays, and
 * how many parts it stood up of each of the plot's elements — its fence, its
 * gate. `hidden` are the elements a sheet's render leaves out on purpose: an
 * upper floor's plan is cut over its own floor alone, as its sheet draws it,
 * and the plot the sheet draws round it is not in the render.
 */
export type AuditFacts = { parking: number; built?: Partial<Record<string, number>>; hidden?: string[] };

/** The elements the plot has one run of: built at all, none is missing from a sheet. */
const SITE_WIDE = new Set(["fence", "gate"]);

/** The plot's elements, which an upper floor's plan render leaves out. */
export const YARD_ELEMENTS = ["parking", "car", "fence", "gate", "lawn"];

/** One sheet's findings; null when no model answered. */
export async function auditPair(pair: AuditPair, drawing: Buffer, render: Buffer, facts: AuditFacts): Promise<HouseAuditFinding[] | null> {
  const answer = await askDrawing(AUDIT_PROMPT(pair.kind), [drawing, render]);
  if (!answer || !Array.isArray(answer.findings)) return null;
  return gradeFindings(pair.sheet, answer.findings as unknown[], facts);
}

/** The model's findings kept: sure enough, well formed, at most eight a sheet, each checked against the build's counts. */
export function gradeFindings(sheet: string, raw: unknown[], facts: AuditFacts): HouseAuditFinding[] {
  const out: HouseAuditFinding[] = [];
  for (const r of raw) {
    const f = r as Record<string, unknown>;
    const issue = f?.issue;
    if (issue !== "missing" && issue !== "extra" && issue !== "moved") continue;
    if (typeof f.confidence === "number" && f.confidence < 0.6) continue;
    const element = ELEMENTS.includes(f.element as string) ? (f.element as string) : "other";
    const finding: HouseAuditFinding = { sheet, element, issue, where: typeof f.where === "string" ? f.where.slice(0, 120) : "" };
    const built = facts.built?.[element] ?? 0;
    if (issue === "missing" && facts.hidden?.includes(element)) {
      finding.contradicted = `התכנית של קומה זו מוצגת בלי המגרש${built > 0 ? `; המודל כולל אותו (${built} חלקים)` : ""}`;
    } else if ((element === "parking" || element === "car") && issue === "missing" && facts.parking > 0) {
      finding.contradicted = `המודל כולל ${facts.parking} חניות עם רכב`;
    } else if (issue === "missing" && SITE_WIDE.has(element) && built > 0) {
      finding.contradicted = `המודל כולל ${built} חלקים של ${element === "fence" ? "הגדר" : "השער"}`;
    }
    out.push(finding);
    if (out.length >= 8) break;
  }
  return out;
}
