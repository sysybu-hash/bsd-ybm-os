import sharp from "sharp";

import {
  buildBuildingBookletHtml,
  buildProjectBookletHtml,
  type BookletImage,
  type BookletTable,
  type BuildingBookletInput,
  type BuildingBookletPlate,
  type BuildingBookletSheet,
  type PlanKey,
  type ProjectBookletChapter,
} from "@/lib/projects/building/booklet-html";
import { PLAN_NORTH, sideTitle, sideWords, viewFrom, type Naming } from "@/lib/projects/building/compass";
import { ELEVATIONS, elevationTitle, type ArtefactStore, type BookletState } from "@/lib/projects/building/dwf-booklet";
import { levelText } from "@/lib/projects/building/dwf-views";
import { DWF_BUILDING_STANDARDS, type BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { roomNameHe, type RoomLabel } from "@/lib/projects/building/room-labels";

/** The booklet's page, from the pictures a job kept and the plain state it carried. */
const jpeg = async (buf: Buffer, width = 2600): Promise<BookletImage> => {
  const { data, info } = await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { mimeType: "image/jpeg", base64: data.toString("base64"), width: info.width, height: info.height };
};

/**
 * A booklet's content from its state: its pages, and what its cover says —
 * `about` the project as a whole (the plot, the levels, the faces, the
 * finish), `model` this model alone (its windows, its garden) — and `report`,
 * what the check of each sheet against its render found. A house's says it
 * in `tables` instead, and `storeys` are its rooms for comparing the models.
 */
export type BookletContent = Omit<BuildingBookletInput, "paragraphs"> & {
  about: string[];
  model: string[];
  report: string[];
  tables?: BookletTable[];
  storeys?: StoreyRooms[];
};

/** A storey's rooms as its sheet labels them: one home's where the sheet draws a mirrored pair. */
export type StoreyRooms = { title: string; level: number; pair: boolean; rooms: Array<{ name: string; dims: string | null; areaM2: number | null }> };

const STOREY_NAMES = ["קומת קרקע", "קומה א'", "קומה ב'", "קומה ג'", "קומה ד'"];
const storeyName = (i: number) => STOREY_NAMES[i] ?? `קומה ${i}`;
const ltr = (s: string) => `<span dir="ltr">${s}</span>`;
const level = (v: number) => ltr(levelText(v));
const sizeText = (d: { w: number; l: number }) => `${d.w.toFixed(2)}×${d.l.toFixed(2)}`;
const areaText = (v: number) => v.toFixed(2);
const roomKey = (r: StoreyRooms["rooms"][number]) => `${r.name} ${r.dims ?? ""}`.trim();
const BEDROOM = /שינה|הורים|ממ"ד/;

/** Each storey's rooms from its sheet's labels, the largest first. */
export function storeyRooms(state: BookletState): StoreyRooms[] {
  return (state.floors ?? [])
    .filter((f) => !f.roof)
    .map((f, i) => {
      const labels = state.rooms?.[f.id] ?? [];
      return {
        title: storeyName(i),
        level: f.level,
        pair: labels.some((l) => !l.home),
        rooms: labels
          .filter((l) => l.home)
          .map((l) => ({ name: roomNameHe(l.name), dims: l.dims ? sizeText(l.dims) : null, areaM2: l.areaM2 }))
          .sort((a, b) => (b.areaM2 ?? -1) - (a.areaM2 ?? -1)),
      };
    });
}

const roomsArea = (s: StoreyRooms[]) => Math.round(s.reduce((n, f) => n + f.rooms.reduce((m, r) => m + (r.areaM2 ?? 0), 0), 0) * 100) / 100;
const bedrooms = (s: StoreyRooms[]) => s.reduce((n, f) => n + f.rooms.filter((r) => BEDROOM.test(r.name)).length, 0);

/** A house model's data page: its rooms storey by storey, its levels, its plot and its openings. */
function houseTables(state: BookletState, storeys: StoreyRooms[]): BookletTable[] {
  const tables: BookletTable[] = [];
  for (const s of storeys) {
    if (!s.rooms.length) continue;
    const total = s.rooms.reduce((n, r) => n + (r.areaM2 ?? 0), 0);
    tables.push({
      title: `${s.title} · מפלס ${levelText(s.level)}`,
      note: s.pair ? "לבית אחד; הבית השני בזוג — תמונת ראי שלו." : undefined,
      head: ["חלל", "מידות (מ')", 'שטח (מ"ר)'],
      rows: s.rooms.map((r) => [escapeText(r.name), r.dims ? ltr(r.dims) : "—", r.areaM2 != null ? areaText(r.areaM2) : "—"]),
      foot: ['סה"כ החללים המסומנים', "", areaText(total)],
    });
  }
  const floors = (state.floors ?? []).filter((f) => !f.roof);
  const naming = namingOf(state);
  const words = siteWords(naming);
  const levels: string[][] = floors.map((f, i) => [`רצפת ${storeyName(i)}`, level(f.level)]);
  if (state.top) levels.push(["גג", level(state.top.roof)], ["ראש מעקה הגג", level(state.top.parapet)]);
  if (state.site) {
    for (const k of ["west", "east", "parkingWest", "parkingEast"] as const) {
      const v = state.site[k];
      if (typeof v === "number") levels.push([words[k]!, level(v)]);
    }
  }
  const w = state.window;
  const measured = w && w.measured > 0;
  levels.push(
    [`אדן חלון${measured ? "" : " (תקן)"}`, ltr((measured ? w!.sill : DWF_BUILDING_STANDARDS.window.sill).toFixed(2))],
    [`משקוף חלון${measured ? "" : " (תקן)"}`, ltr((measured ? w!.head : DWF_BUILDING_STANDARDS.window.head).toFixed(2))],
    ["מעקה מרפסת וגג (תקן)", ltr(DWF_BUILDING_STANDARDS.railing.toFixed(2))],
  );
  tables.push({
    title: "מפלסים וגבהים",
    note: `ביחס ל־±0.00.${measured ? ` גובה החלונות נמדד על החזיתות (${w!.measured} חלונות).` : ""}`,
    head: ["רכיב", "מפלס / גובה (מ')"],
    rows: levels,
  });
  const site: string[][] = [];
  if (state.plot) {
    const [pw, pd] = [state.plot.x1 - state.plot.x0, state.plot.z1 - state.plot.z0];
    site.push(["מגרש (רוחב × עומק)", ltr(`${pw.toFixed(2)}×${pd.toFixed(2)} מ'`)], ["שטח המגרש", `${areaText(pw * pd)} מ"ר`]);
  }
  if (state.parking) site.push(["חניות", String(state.parking)]);
  if (state.lawnM2) site.push(["דשא", `${state.lawnM2.toFixed(1)} מ"ר`]);
  if (site.length) tables.push({ title: "מגרש", head: ["פריט", "ערך"], rows: site });
  const openings = state.openings ?? [];
  if (openings.length) {
    const widths = [...new Set(openings.flatMap((o) => Object.keys(o.doors).filter((k) => k !== "null")))].sort((a, b) => Number(a) - Number(b));
    tables.push({
      title: "פתחים",
      note: storeys.some((s) => s.pair) ? "בשני הבתים יחד, לפי בלוקי הדלתות והחלונות בקובץ." : "לפי בלוקי הדלתות והחלונות בקובץ.",
      head: ["קומה", ...widths.map((x) => `דלת ${x}`), "חלונות"],
      rows: openings.map((o) => [storeyName(o.storey), ...widths.map((x) => String(o.doors[x] ?? 0)), String(o.windows)]),
    });
  }
  return tables;
}

/** How a model's rooms differ from the first model's, storey by storey: a row a storey that differs. */
function roomDifferences(base: StoreyRooms[], other: StoreyRooms[]): Array<{ storey: string; text: string }> {
  const out: Array<{ storey: string; text: string }> = [];
  for (let i = 0; i < Math.max(base.length, other.length); i++) {
    const [b, o] = [base[i], other[i]];
    if (!b || !o) {
      out.push({ storey: storeyName(i), text: o ? "קומה נוספת" : "אין קומה זו" });
      continue;
    }
    const left = [...b.rooms];
    const added: StoreyRooms["rooms"] = [];
    for (const r of o.rooms) {
      const at = left.findIndex((q) => roomKey(q) === roomKey(r));
      if (at >= 0) left.splice(at, 1);
      else added.push(r);
    }
    const parts: string[] = [];
    for (const r of added) {
      const was = left.findIndex((q) => q.name === r.name);
      if (was >= 0) {
        parts.push(`${escapeText(r.name)} ${ltr(r.dims ?? "—")} במקום ${ltr(left[was]!.dims ?? "—")}`);
        left.splice(was, 1);
      } else parts.push(`נוסף ${escapeText(r.name)}${r.dims ? ` ${ltr(r.dims)}` : ""}`);
    }
    for (const r of left) parts.push(`אין ${escapeText(r.name)}${r.dims ? ` ${ltr(r.dims)}` : ""}`);
    if (parts.length) out.push({ storey: o.title, text: parts.join("; ") });
  }
  return out;
}

export async function assembleBookletHtml(projectName: string, state: BookletState, store: ArtefactStore): Promise<string> {
  const { about, model, report: _report, ...content } = await bookletContent(projectName, state, store);
  const audit = auditParagraph(state);
  // One model's booklet says it all on its cover, the check's findings with it.
  const [plot, ...rest] = about;
  return buildBuildingBookletHtml({ ...content, paragraphs: [...(plot ? [plot] : []), ...model, ...rest, ...(audit ? [audit] : [])] });
}

/**
 * Several models' booklets as one (buildProjectBookletHtml): one cover with
 * what holds for the whole project, read off the first model, then a chapter
 * a model, and the check's findings in the appendix.
 */
export async function assembleProjectBookletHtml(input: {
  projectName: string;
  subtitle: string;
  models: Array<{ name: string; state: BookletState; store: ArtefactStore }>;
}): Promise<string> {
  const contents = await Promise.all(input.models.map((m) => bookletContent(m.name, m.state, m.store)));
  const first = contents[0];
  if (!first) throw new Error("אין דגמים בחוברת");
  const chapters: ProjectBookletChapter[] = contents.map((c, i) => ({
    name: input.models[i]!.name,
    hero: c.hero,
    kpis: c.kpis,
    paragraphs: c.model,
    rooms: c.rooms,
    ...(c.tables ? { tables: c.tables } : {}),
    sheets: c.sheets,
    plates: c.plates,
    report: c.report,
  }));
  const value = (label: string) => first.kpis.find((k) => k.label === label)?.value ?? "";
  const names = input.models.map((m) => m.name);
  return buildProjectBookletHtml({
    projectName: input.projectName,
    subtitle: input.subtitle,
    hero: first.hero,
    kpis: [
      { label: "דגמים", value: String(chapters.length) },
      { label: "קומות", value: value("קומות") },
      { label: "גובה", value: value("גובה") },
      { label: "גיליונות", value: String(chapters.reduce((n, c) => n + c.sheets.length, 0)) },
    ],
    paragraphs: first.about,
    ...(first.storeys ? { tables: modelTables(names, contents, input.models.map((m) => m.state)) } : {}),
    chapters,
  });
}

/** A house project's cover: each model's areas side by side, and how each differs from the first. */
function modelTables(names: string[], contents: BookletContent[], states: BookletState[]): BookletTable[] {
  const storeys = contents.map((c) => c.storeys ?? []);
  const depth = Math.max(...storeys.map((s) => s.length));
  const pair = storeys.some((s) => s.some((f) => f.pair));
  const tables: BookletTable[] = [
    {
      title: `שטחים לפי דגם${pair ? " (לבית אחד)" : ""}`,
      note: 'סכום השטחים שבתוויות החדרים, מ"ר.',
      head: ["דגם", ...Array.from({ length: depth }, (_, i) => storeyName(i)), 'סה"כ', "חדרי שינה"],
      rows: storeys.map((s, i) => [
        escapeText(names[i]!),
        ...Array.from({ length: depth }, (_, k) => (s[k] ? areaText(roomsArea([s[k]!])) : "—")),
        areaText(roomsArea(s)),
        String(bedrooms(s)),
      ]),
    },
  ];
  if (names.length > 1) {
    const rows: string[][] = [];
    for (let i = 1; i < names.length; i++) {
      const found = roomDifferences(storeys[0]!, storeys[i]!);
      const [a, b] = [states[0]!, states[i]!];
      if (a.top && b.top && Math.abs(a.top.parapet - b.top.parapet) >= 0.01) found.push({ storey: "גובה", text: `ראש המעקה ${level(b.top.parapet)} במקום ${level(a.top.parapet)}` });
      if ((a.parking ?? 0) !== (b.parking ?? 0)) found.push({ storey: "מגרש", text: `${b.parking ?? 0} חניות במקום ${a.parking ?? 0}` });
      if (!found.length) rows.push([escapeText(names[i]!), "—", `זהה ל${escapeText(names[0]!)}`]);
      for (const f of found) rows.push([escapeText(names[i]!), escapeText(f.storey), f.text]);
    }
    tables.push({ title: `ההבדלים בין הדגמים — מול ${names[0]}`, head: ["דגם", "קומה", "שינוי"], rows });
  }
  return tables;
}

/**
 * A house plan's key: the rooms its sheet names in the first home, numbered in reading order, marked on the plan in both homes (the
 * second the mirror of the first about the pair's axis) and listed with the architect's own name and size. A room is placed by where
 * its name stands on the sheet, the render's frame being the sheet's with `padM` round it.
 */
export function planKeyOf(input: {
  labels: RoomLabel[];
  floor: Pick<BuildingFloorMeta, "sheetWidth" | "sheetHeight" | "shift" | "outline">;
  padM: number;
  north?: { x: number; z: number };
}): PlanKey | undefined {
  const { floor, padM } = input;
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const [w0, h0] = [floor.sheetWidth / upm, floor.sheetHeight / upm];
  const [w, h] = [w0 + 2 * padM, h0 + 2 * padM];
  const [x0, z0] = [w0 / 2 + floor.shift.x - w / 2, h0 / 2 + floor.shift.y - h / 2];
  const pair = input.labels.some((l) => !l.home);
  const named = input.labels.filter((l) => l.home && (l.name || l.dims)).sort((a, b) => a.fy - b.fy || a.fx - b.fx);
  if (!named.length || !floor.outline.length) return undefined;
  const xs = floor.outline.map(([x]) => x);
  const axis = (Math.min(...xs) + Math.max(...xs)) / 2;
  const rows: PlanKey["rows"] = [];
  const markers: PlanKey["markers"] = [];
  for (const [i, l] of named.entries()) {
    const n = i + 1;
    const [xm, zm] = [floor.shift.x + l.fx * w0, floor.shift.y + l.fy * h0];
    markers.push({ fx: (xm - x0) / w, fy: (zm - z0) / h, n });
    if (pair) markers.push({ fx: (2 * axis - xm - x0) / w, fy: (zm - z0) / h, n });
    rows.push({ n, name: l.name ? roomNameHe(l.name) : "חלל", dims: l.dims ? sizeText(l.dims) : "—", area: l.areaM2 != null ? areaText(l.areaM2) : "—" });
  }
  return { rows, markers, scale: { fraction: 5 / w, metres: 5 }, north: input.north ?? { x: 0, z: -1 } };
}

async function bookletContent(projectName: string, state: BookletState, store: ArtefactStore): Promise<BookletContent> {
  const a = state.artefacts ?? {};
  const house = state.finish === "house";
  // A house's facade without the band of earth under it: the section's cut
  // ground stood a flat brown slab across a third of every facade
  // (12/10/2026). Cut just under the garden, a strip of ground kept.
  const image = async (name: string) => {
    if (!a[name]) return null;
    const buf = await store.get(a[name]!);
    // A house's elevation sheet without the white round its drawing: the drawing fills its half of the page.
    if (house && /^sheet-elev-/.test(name)) return jpeg(await withoutMargin(buf));
    // The street facade is cut at the plot's boundary through the yard — bays, walls, the bins' enclosure — and the cut ground
    // stood as brown blocks across its foot; the facade is shown to the floor's line, as the other three are to their ground.
    if (house && /^view-elev-south/.test(name)) return jpeg(await facadeAboveYard(buf));
    return jpeg(house && /^view-elev-/.test(name) ? await withoutEarthBand(buf) : buf);
  };
  const painted = new Set(state.painted ?? []);
  // A house's booklet says, under each picture, whether it is painted or the measured render.
  // A picture the painting did not hold says so plainly: the render stands, unpainted.
  const how = (name: string) =>
    !house || !state.painted
      ? ""
      : painted.has(name)
        ? " · הדמיה פוטוריאליסטית על גבי המודל המדוד."
        : /^view-plan-floor-/.test(name)
          ? " · תכנית תלת־ממד מדויקת, כפי שנבנתה מהתשריט — רינדור מדוד, בלי צביעה, כדי שכל קיר, מדרגה ופריט יעמדו במקומם."
          : " · הדמיה מדודה — לא נצבעה.";
  const floors = (state.floors ?? []).filter((f) => !f.roof);
  const sheets: BuildingBookletSheet[] = [];
  let no = 0;
  for (const [i, f] of floors.entries()) {
    const [sheet, render] = [await image(`sheet-${f.id}.jpg`), await image(`view-plan-${f.id}.jpg`)];
    if (!sheet || !render) continue;
    // No room names over a house's plan: Gottlieb's sheets name half their
    // rooms, some in one home only and some by size alone, and written over
    // the picture they stood partial and one-sided (15/10/2026). The sheet
    // beside it and the areas table carry the architect's names.
    const named = house && (state.rooms?.[f.id] ?? []).length > 0;
    const key = house ? planKeyOf({ labels: state.rooms?.[f.id] ?? [], floor: f, padM: state.planPadM?.[f.id] ?? 0, north: state.north }) : undefined;
    sheets.push({
      no: ++no,
      title: f.units.length ? `קומה ${levelText(f.level)} — דירות ${f.units.join(", ")}` : house ? `${storeyName(i)} · ${levelText(f.level)}` : `קומה ${levelText(f.level)}`,
      caption: key
        ? `תכנית הקומה מלמעלה, באותה מסגרת ובאותו קנה מידה כמו הגיליון. החללים ממוספרים, והמקרא בצד: שם, מידות ושטח כפי שכתב האדריכל. פריטי עיצוב (שטיחים, שולחן קפה, שידות לילה, עציצים וקערות פירות) נוספו להמחשה ואינם חלק מהתשריט.${how(`view-plan-${f.id}.jpg`)}`
        : `תכנית הקומה והקומה בהדמיה, מלמעלה, באותה מסגרת ובאותו קנה מידה${named ? "; שמות החדרים ושטחם — בגיליון שלצד ההדמיה ובטבלת השטחים" : ""}. פריטי עיצוב (שטיחים, שולחן קפה, שידות לילה, עציצים וקערות פירות) נוספו להמחשה ואינם חלק מהתשריט.${how(`view-plan-${f.id}.jpg`)}`,
      sheet,
      render,
      ...(key ? { key } : {}),
    });
  }
  for (const id of state.elevations ?? []) {
    const [sheet, render] = [await image(`sheet-${id}.jpg`), await image(`view-${id}.jpg`)];
    const side = ELEVATIONS.find(([e]) => e === id)?.[1];
    const title = side ? sideTitle(side, namingOf(state)) : elevationTitle(id, state.north);
    if (sheet && render) sheets.push({ no: ++no, title, caption: `החזית בגיליון, והבניין בהדמיה במבט ישר אל אותה חזית.${faceNote(state)}${how(`view-${id}.jpg`)}`, sheet, render });
  }

  const plates: BuildingBookletPlate[] = [];
  const naming = namingOf(state);
  // A house's from its street at eye height; a building's from above.
  const aerials: Array<[string, string]> = house
    ? [
        ["corner-front", "מבט מהרחוב — החזית המלאה"],
        ["corner-a", "מבט מהרחוב — חזית וצד"],
        ["corner-b", "מבט מהרחוב — חזית והצד השני"],
        ["aerial-top", "המגרש — מבט מלמעלה"],
      ]
    : [
        ["aerial-se", `מבט ${viewFrom({ x: 1, z: 1 }, naming)}`],
        ["aerial-nw", `מבט ${viewFrom({ x: -1, z: -1 }, naming)}`],
        ["aerial-top", "המגרש — מבט מלמעלה"],
      ];
  for (const [id, title] of aerials) {
    const img = await image(`view-${id}.jpg`);
    const caption =
      id === "aerial-top"
        ? "המגרש במבט ישר מלמעלה, באותה מסגרת כמו גיליון קומת הקרקע: הגגות, הגינות, החניות עם הרכבים, השבילים, גדרות האבן, השער, פחי האשפה והרחוב — כל אחד במקומו בגיליון."
        : house
          ? "זוג הבתים הצמודים מהמדרכה שמעבר לרחוב, בגובה העין — כפי שעובר אורח רואה אותם: החניות, השער, גדרות האבן ופחי האשפה במקומם בגיליון."
          : "הבניין כולו, כפי שנבנה מתוכניות הקומות, המפלסים והחתכים שבגרמושקה.";
    if (img) plates.push({ kicker: "מבט חוץ", title, caption: `${caption}${how(`view-${id}.jpg`)}`, image: img });
  }
  // A house's main rooms from eye height (dwf-views houseRoomViews), furnished as its sheets draw them.
  if (house) {
    const rooms: Array<[string, string]> = [
      ["room-living", "הסלון ופינת האוכל"],
      ["room-kitchen", "המטבח"],
      ["room-bedroom", "חדר השינה"],
    ];
    for (const [id, title] of rooms) {
      const img = await image(`view-${id}.jpg`);
      if (img)
        plates.push({
          kicker: "הדמיית פנים",
          title,
          caption: `מבט מגובה העין בבית הראשון שבזוג (השני — תמונת ראי שלו). הריהוט מוצב כפי שהתשריט משרטט אותו — כל פריט במקומו ובמספרו; פריטי עיצוב (שטיחים, שולחן קפה, שידות לילה, עציצים וקערות פירות) נוספו להמחשה.${how(`view-${id}.jpg`)}`,
          image: img,
        });
    }
  }
  const apartments = state.apartments ?? [];
  for (const apt of apartments) {
    const img = await image(`unit-${apt.key}.jpg`);
    if (!img) continue;
    const terraces = apt.terraces ? `, ${apt.terraces === 1 ? "מרפסת" : `${apt.terraces} מרפסות`}` : "";
    plates.push({
      kicker: house ? "בתים" : "דירות",
      title: apt.label,
      caption: `${apt.bedrooms} חדרי שינה (כולל ממ"ד), ${apt.spaces} חללים, ${apt.areaM2.toFixed(1)} מ"ר${terraces}.${how(`unit-${apt.key}.jpg`)}`,
      image: img,
    });
  }

  // A house's height is its parapet's top, where the elevations mark it — not the roof's level the storeys stop at.
  const top = state.top?.parapet ?? Math.max(...floors.map((f) => f.level + f.height));
  // The cover is a painted view where the job painted: the hero, else a painted aerial. Only where
  // none held does the measured hero stand — the C model's cover of 9/10/2026 went in raw, unmarked.
  const heroNames = ["view-hero.jpg", "view-corner-a.jpg", "view-aerial-se.jpg", "view-aerial-nw.jpg"];
  const heroName = (state.painted ? heroNames.find((n) => painted.has(n) && a[n]) : undefined) ?? heroNames.find((n) => a[n]);
  const hero = heroName ? await image(heroName) : null;
  if (!hero) throw new Error("the building could not be drawn");
  const ai = aiParagraphs(state);
  const storeys = house ? storeyRooms(state) : [];
  const area = roomsArea(storeys);
  return {
    projectName,
    subtitle: state.subtitle ?? "",
    architect: "",
    hero,
    kpis: [
      { label: "קומות", value: String(floors.length) },
      house ? { label: "חניות", value: String(state.parking ?? 0) } : { label: "דירות", value: String(new Set(apartments.map((x) => x.key.replace(/-.*$/, ""))).size) },
      { label: "גובה", value: `<span dir="ltr">${levelText(top)}</span>` },
      ...(area > 0 ? [{ label: storeys.some((s) => s.pair) ? "שטח חללים לבית" : "שטח חללים", value: `${areaText(area)} מ"ר` }] : []),
      { label: "גיליונות", value: String(sheets.length) },
    ],
    ...(house ? { tables: houseTables(state, storeys), storeys } : {}),
    about: house
      ? houseBrief(state, storeys)
      : [
          "הבניין נבנה ישירות מגרמושקת ההיתר: כל תוכנית קומה נקראה לקירות, לפתחים, לחדרים ולדירות, המפלס של כל קומה נלקח מהמפלסים שמסומנים עליה, והקומות הונחו זו על זו לפי הקירות שחוזרים בכולן — חדר המדרגות והמעלית.",
          `חומרי החזית נקראו מהחזיתות עצמן — מכל כיתוב חומר ("אבן כהה", "אבן גוון 2", "טיח") ומדוגמת הקווקוו שסביבו — וכל קיר בחזית קיבל את החומר שמשורטט במקומו. דלת למרפסת מזוגגת עד הרצפה; מעקה מרפסת וגג בגובה ${DWF_BUILDING_STANDARDS.railing.toFixed(2)} מ', מעקה סורגים כשהחזיתות משרטטות סורגים.`,
        ],
    model: house ? [] : [windowSentence(state.window), ...ai.model],
    report: auditLines(state),
    rooms: apartments.map((x) => ({ name: x.label, floor: `<span dir="ltr">${levelText(x.levelM)}</span>`, area: `${x.areaM2.toFixed(1)} מ"ר` })),
    sheets,
    plates,
  };
}

/** How the booklet names the sides: as its state says, else by the compass. */
function namingOf(state: BookletState): Naming {
  return state.naming ?? { by: "compass", north: state.north ?? PLAN_NORTH };
}

/** What the booklet says of the windows: measured on the elevations, or the standard where none could be. */
function windowSentence(w: BookletState["window"]): string {
  if (w && w.measured >= 5) {
    return `גובה החלונות נמדד על החזיתות: כל חלון לפי מה שמשורטט מעליו ומתחתיו, ובחלון שהחזית אינה מראה בבירור — האדן והמשקוף הנפוצים בבניין (${w.sill.toFixed(2)} ו־${w.head.toFixed(2)} מ', מתוך ${w.measured} חלונות שנמדדו).`;
  }
  if (w && w.measured > 0) {
    return `גובה ${w.measured} חלונות נמדד על החזיתות לפי מה שמשורטט מעליהם ומתחתיהם; בשאר החלונות — תקן מקובל: אדן ${DWF_BUILDING_STANDARDS.window.sill.toFixed(2)} מ' ומשקוף ${DWF_BUILDING_STANDARDS.window.head.toFixed(2)} מ'.`;
  }
  return `גובה החלונות לפי תקן מקובל: אדן ${DWF_BUILDING_STANDARDS.window.sill.toFixed(2)} מ' ומשקוף ${DWF_BUILDING_STANDARDS.window.head.toFixed(2)} מ'.`;
}

/** Under an elevation of a house: whose its face's name is. */
function faceNote(state: BookletState): string {
  const f = state.ai?.faces;
  if (!f) return "";
  if (f.source === "ai") return " כיוון החזית זוהה בבינה מלאכותית ואומת מול תוכנית הקומה.";
  return f.verified ? " כיוון החזית לפי שיוך ידני, שאומת מול תוכנית הקומה." : " כיוון החזית לפי שיוך ידני, שלא ניתן היה לאמת.";
}

/**
 * The plot's levels in words. `west` and `east` are the plan's left and
 * right (house-yard.ts); the words are the compass's.
 */
function siteWords(naming: Naming): Record<string, string> {
  const [left, right] = [sideWords("west", naming), sideWords("east", naming)];
  return { west: `הקרקע ${left.in}`, east: `הקרקע ${right.in}`, parkingWest: `החניה ${left.adj}`, parkingEast: `החניה ${right.adj}` };
}

/** Which way the plot falls, by the compass: from its higher side, the plan's left or right, to the lower. Empty where it is level. */
function slopePhrase(state: BookletState): string {
  const site = state.site;
  const naming = namingOf(state);
  if (!site || Math.abs(site.east - site.west) < 0.3) return "";
  const [high, low] = site.east > site.west ? (["east", "west"] as const) : (["west", "east"] as const);
  return `המגרש יורד ${sideWords(high, naming).from} ל${sideWords(low, naming).name}`;
}

/** A house booklet's few lines of explanation: what was built, where its numbers come from, and how far it is painted. */
function houseBrief(state: BookletState, storeys: StoreyRooms[]): string[] {
  const pair = storeys.some((s) => s.pair);
  const slope = slopePhrase(state);
  const sources = [
    storeys.some((s) => s.rooms.length) ? `המידות והשטחים — כפי שנכתבו בתוויות החדרים בתוכניות (רוחב × אורך, נטו${pair ? ", לבית אחד" : ""})` : "",
    "המפלסים — מסימוני החזיתות",
    state.openings?.length ? "הדלתות והחלונות — מבלוקי הקובץ" : "",
  ].filter(Boolean);
  const lines = [
    `${pair ? "זוג בתים צמודים (דו־משפחתי)" : "בית פרטי"} ב־${storeys.length} קומות, שנבנה בתלת־ממד ישירות מגיליונות האדריכל בקנ"מ 1:100${slope ? `; ${slope}` : ""}.`,
    `${sources.join("; ")}. הריהוט והצמחייה בהדמיות — להמחשה.`,
  ];
  if (!state.painted) lines.push("טיוטה: ההדמיות מדודות ואינן צבועות.");
  else {
    // Said of what was painted: Gottlieb's plans painted and its exteriors not stood under "plans not painted" (15/10/2026).
    const plans = state.painted.some((n) => /^view-plan-/.test(n));
    const views = state.painted.some((n) => !/^view-plan-/.test(n));
    lines.push(
      `${plans ? "תוכניות הקומות נצבעו כצילום של דגם אדריכלי על גבי התלת־ממד המדויק ונבדקו מולו" : "תוכניות הקומות — תלת־ממד מדויק, ללא צביעה"}; ${views ? "מבטי החוץ והחזיתות נצבעו כצילום על גבי ההדמיה המדודה ונבדקו מולה" : "מבטי החוץ והחזיתות — הדמיה מדודה, ללא צביעה"}. תמונה שלא נצבעה מסומנת מתחתיה.`,
    );
  }
  if (state.budget) lines.push(`הצביעה נעצרה בתקרת ₪${state.budget.ils}; ${state.budget.unpainted} תמונות מוצגות כהדמיה המדודה.`);
  return lines;
}
const ELEMENT_WORDS: Record<string, string> = {
  window: "חלון",
  door: "דלת",
  wall: "קיר",
  stairs: "מדרגות",
  parking: "חניה",
  car: "רכב",
  fence: "גדר",
  gate: "שער",
  lawn: "דשא",
  roof: "גג",
  balcony: "מרפסת",
  other: "פריט",
};
const ISSUE_WORDS: Record<string, string> = { missing: "חסר בהדמיה", extra: "בהדמיה ולא בגיליון", moved: "במיקום שונה" };

/** What a house's booklet says of the vision model: what it read off the sheets, and what of it the sheets bore out — for the project, and for this model's garden. */
function aiParagraphs(state: BookletState): { project: string[]; model: string[] } {
  const ai = state.ai;
  if (!ai) return { project: [], model: [] };
  const out: string[] = [];
  const model: string[] = [];
  const read = ai.levels.reduce((s, l) => s + l.read, 0);
  const kept = ai.levels.reduce((s, l) => s + l.kept, 0);
  const failed = ai.levels.filter((l) => !l.ok).map((l) => l.title);
  out.push(
    `סימוני המפלס בחזיתות משורטטים בגופן CAD כקווים ולא ככתב, ולכן נקראו בבינה מלאכותית (Gemini). מתוך ${read} סימונים שנקראו אומתו ${kept}: כל ערך הונח על משולש המפלס המשורטט במקום שבו נקרא, והסימונים יחד מתיישבים על קנה המידה 1:100 של הגיליון בסטייה של עד 5 ס"מ; ערך שלא עמד בכך נפסל.${failed.length ? ` ב${failed.join(", ")} לא אומתו די סימונים, והחזית נקראה בלעדיהם.` : ""}`,
  );
  const words = siteWords(namingOf(state));
  const site = (Object.keys(words) as Array<keyof typeof ai.site.from>)
    .filter((k) => typeof ai.site.values[k] === "number")
    .map((k) => `${words[k]} <span dir="ltr">${levelText(ai.site.values[k] as number)}</span> (${ai.site.from[k] === "ai" ? "מסימוני החזיתות שאומתו" : "קריאה ידנית"})`);
  out.push(`מפלסי המגרש ביחס ל־±0.00: ${site.join(", ")}.`);
  const missingTitles = ai.faces.missingSides ? ai.faces.missingSides.map((s) => sideTitle(s, namingOf(state))) : ai.faces.missing;
  const missing = missingTitles.length ? ` ${missingTitles.join(", ")} אינה משורטטת בגיליון החזיתות.` : "";
  out.push(
    ai.faces.source === "ai"
      ? `כיוון כל חזית זוהה בבינה מלאכותית ואומת מול תוכנית הקומה — רוחב הבית בכל חזית, צד החניה ושיפוע הקרקע (${ai.faces.checks} בדיקות).${missing}`
      : `כיוון החזיתות לפי שיוך ידני${ai.faces.verified ? `, שאומת מול תוכנית הקומה (${ai.faces.checks} בדיקות)` : ", שלא ניתן היה לאמת מול תוכנית הקומה"}${ai.faces.failures.length ? "; ההצעה של הבינה המלאכותית לא עמדה בבדיקה ולא נעשה בה שימוש" : ""}.${missing}`,
  );
  if (ai.yard) {
    model.push(
      ai.yard.shown
        ? `${ai.yard.shown} חלקי מגרש שהגיליון אינו מסמן סווגו בבינה מלאכותית; ${ai.yard.laid ? `${ai.yard.laid} מהם נבנו כגינה, רק היכן שהקווים בגיליון תומכים בכך,` : "אף אחד מהם לא שונה,"} והשאר נשארו מרוצפים כפי שהגיליון משאיר אותם.`
        : "חלקי המגרש שהגיליון אינו מסמן נשארו מרוצפים.",
    );
  }
  return { project: out, model };
}

const escapeText = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** What the check of each sheet against its render found, a line a finding. */
function auditLines(state: BookletState): string[] {
  return (state.audit ?? []).map((f) => `${ELEMENT_WORDS[f.element] ?? "פריט"} ${ISSUE_WORDS[f.issue]}${f.where ? ` (${escapeText(f.where)})` : ""}${f.contradicted ? ` — ${f.contradicted}` : ""}`);
}

/** The check's findings as one model's cover says them. */
function auditParagraph(state: BookletState): string | null {
  if (!state.audit) return null;
  const items = auditLines(state);
  return items.length
    ? `בדיקה סופית: כל גיליון הושווה בבינה מלאכותית להדמיה המדודה שלו. ${items.length} הבדלים אפשריים דווחו ולא תוקנו אוטומטית: ${items.join("; ")}.`
    : "בדיקה סופית: כל גיליון הושווה בבינה מלאכותית להדמיה המדודה שלו, ולא נמצאו הבדלים.";
}

/**
 * A picture cut above the plain band along its foot: from the bottom up, the
 * rows of one even colour — the section's earth, painted or not — are taken
 * away but for a strip 4% of the height. Nothing to cut, the picture as it is.
 */
/** A drawing's picture without the white margin round it, a hand of white left. */
export async function withoutMargin(image: Buffer): Promise<Buffer> {
  try {
    const trimmed = await sharp(image).trim({ background: "#ffffff", threshold: 14 }).toBuffer({ resolveWithObject: true });
    const { width = 1, height = 1 } = await sharp(image).metadata();
    // Nothing worth cutting, or all of it gone: the picture as it is.
    if (trimmed.info.width > width * 0.98 && trimmed.info.height > height * 0.98) return image;
    if (trimmed.info.width < width * 0.3 || trimmed.info.height < height * 0.3) return image;
    return sharp(trimmed.data).extend({ top: 24, bottom: 24, left: 24, right: 24, background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
  } catch {
    return image;
  }
}

/**
 * The street facade down to the line where the cut ground begins: the first rows, from the middle down, that are earth-brown
 * across a tenth of the width or more; the picture is cut there, a strip of ground kept. Nothing brown, the picture as it is.
 */
export async function facadeAboveYard(image: Buffer): Promise<Buffer> {
  const W = 300;
  const { width = 1, height = 1 } = await sharp(image).metadata();
  const H = Math.max(10, Math.round((W * height) / width));
  const px = await sharp(image).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const earth = (i: number) => {
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    return r >= 95 && r <= 185 && g >= 80 && g <= 160 && b >= 55 && b <= 130 && r - b >= 22 && r - b <= 75 && r >= g && g >= b;
  };
  const brown = (y: number) => {
    let n = 0;
    for (let x = 0; x < W; x++) if (earth((y * W + x) * 3)) n++;
    return n / W;
  };
  for (let y = Math.floor(H * 0.45); y < H - 3; y++) {
    if (brown(y) >= 0.1 && brown(y + 1) >= 0.1 && brown(y + 2) >= 0.1) {
      const keep = Math.min(height, Math.round(((y + H * 0.012) / H) * height));
      if (height - keep < height * 0.04) return image;
      return sharp(image).extract({ left: 0, top: 0, width, height: keep }).jpeg({ quality: 92 }).toBuffer();
    }
  }
  return image;
}

export async function withoutEarthBand(image: Buffer): Promise<Buffer> {
  const W = 200;
  const { width = 1, height = 1 } = await sharp(image).metadata();
  const H = Math.max(10, Math.round((W * height) / width));
  const px = await sharp(image).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const row = (y: number) => {
    const m = [0, 0, 0];
    for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) m[c] = m[c]! + px[(y * W + x) * 3 + c]!;
    const mean = m.map((v) => v / W);
    let spread = 0;
    for (let x = 0; x < W; x++) spread += Math.abs(px[(y * W + x) * 3]! - mean[0]!) + Math.abs(px[(y * W + x) * 3 + 1]! - mean[1]!) + Math.abs(px[(y * W + x) * 3 + 2]! - mean[2]!);
    return { mean, spread: spread / W };
  };
  const foot = row(H - 2).mean;
  let y = H - 2;
  while (y > H * 0.4) {
    const r = row(y - 1);
    if (r.spread > 18 || Math.hypot(r.mean[0]! - foot[0]!, r.mean[1]! - foot[1]!, r.mean[2]! - foot[2]!) > 22) break;
    y--;
  }
  if (H - y < H * 0.08) return image;
  const keep = Math.min(height, Math.round(((y + H * 0.04) / H) * height));
  return sharp(image).extract({ left: 0, top: 0, width, height: keep }).jpeg({ quality: 92 }).toBuffer();
}
