import sharp from "sharp";

import { buildBuildingBookletHtml, type BookletImage, type BuildingBookletPlate, type BuildingBookletSheet } from "@/lib/projects/building/booklet-html";
import { ELEVATIONS, type ArtefactStore, type BookletState } from "@/lib/projects/building/dwf-booklet";
import { levelText } from "@/lib/projects/building/dwf-views";
import { DWF_BUILDING_STANDARDS } from "@/lib/projects/building/from-dwf";

/** The booklet's page, from the pictures a job kept and the plain state it carried. */
const jpeg = async (buf: Buffer, width = 2600): Promise<BookletImage> => ({
  mimeType: "image/jpeg",
  base64: (await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64"),
});

export async function assembleBookletHtml(projectName: string, state: BookletState, store: ArtefactStore): Promise<string> {
  const a = state.artefacts ?? {};
  const image = async (name: string) => (a[name] ? jpeg(await store.get(a[name]!)) : null);
  const floors = (state.floors ?? []).filter((f) => !f.roof);
  const sheets: BuildingBookletSheet[] = [];
  let no = 0;
  for (const f of floors) {
    const [sheet, render] = [await image(`sheet-${f.id}.jpg`), await image(`view-plan-${f.id}.jpg`)];
    if (!sheet || !render) continue;
    sheets.push({
      no: ++no,
      title: f.units.length ? `קומה ${levelText(f.level)} — דירות ${f.units.join(", ")}` : `קומה ${levelText(f.level)}`,
      caption: `תכנית הקומה והקומה בהדמיה, מלמעלה, באותה מסגרת ובאותו קנה מידה. ${Math.round(f.registration * 100)}% מקירות הגיליון מתיישבים על הקומה הסמוכה.`,
      sheet,
      render,
    });
  }
  for (const id of state.elevations ?? []) {
    const [sheet, render] = [await image(`sheet-${id}.jpg`), await image(`view-${id}.jpg`)];
    const title = ELEVATIONS.find(([e]) => e === id)?.[1] ?? id;
    if (sheet && render) sheets.push({ no: ++no, title, caption: "החזית בגיליון, והבניין בהדמיה במבט ישר אל אותה חזית.", sheet, render });
  }

  const plates: BuildingBookletPlate[] = [];
  for (const [id, title] of [["aerial-se", "מבט על מדרום־מזרח"], ["aerial-nw", "מבט על מצפון־מערב"]] as const) {
    const img = await image(`view-${id}.jpg`);
    if (img) plates.push({ kicker: "מבט חוץ", title, caption: "הבניין כולו, כפי שנבנה מתוכניות הקומות, המפלסים והחתכים שבגרמושקה.", image: img });
  }
  const apartments = state.apartments ?? [];
  for (const apt of apartments) {
    const img = await image(`unit-${apt.key}.jpg`);
    if (!img) continue;
    const terraces = apt.terraces ? `, ${apt.terraces === 1 ? "מרפסת" : `${apt.terraces} מרפסות`}` : "";
    plates.push({ kicker: "דירות", title: apt.label, caption: `${apt.bedrooms} חדרי שינה (כולל ממ"ד), ${apt.spaces} חללים, ${apt.areaM2.toFixed(1)} מ"ר${terraces}.`, image: img });
  }

  const top = Math.max(...floors.map((f) => f.level + f.height));
  const hero = (await image("view-hero.jpg")) ?? (await image("view-aerial-se.jpg"));
  if (!hero) throw new Error("the building could not be drawn");
  return buildBuildingBookletHtml({
    projectName,
    subtitle: state.subtitle ?? "",
    architect: "",
    hero,
    kpis: [
      { label: "קומות", value: String(floors.length) },
      { label: "דירות", value: String(new Set(apartments.map((x) => x.key.replace(/-.*$/, ""))).size) },
      { label: "גובה", value: `<span dir="ltr">${levelText(top)}</span>` },
      { label: "גיליונות", value: String(sheets.length) },
    ],
    paragraphs: [
      "הבניין נבנה ישירות מגרמושקת ההיתר: כל תוכנית קומה נקראה לקירות, לפתחים, לחדרים ולדירות, המפלס של כל קומה נלקח מהמפלסים שמסומנים עליה, והקומות הונחו זו על זו לפי הקירות שחוזרים בכולן — חדר המדרגות והמעלית.",
      windowSentence(state.window),
      `חומרי החזית נקראו מהחזיתות עצמן — מכל כיתוב חומר ("אבן כהה", "אבן גוון 2", "טיח") ומדוגמת הקווקוו שסביבו — וכל קיר בחזית קיבל את החומר שמשורטט במקומו. דלת למרפסת מזוגגת עד הרצפה; מעקה מרפסת וגג בגובה ${DWF_BUILDING_STANDARDS.railing.toFixed(2)} מ', מעקה סורגים כשהחזיתות משרטטות סורגים.`,
    ],
    rooms: apartments.map((x) => ({ name: x.label, floor: `<span dir="ltr">${levelText(x.levelM)}</span>`, area: `${x.areaM2.toFixed(1)} מ"ר` })),
    sheets,
    plates,
  });
}

/** What the booklet says of the windows: measured on the elevations, or the standard where none could be. */
function windowSentence(w: BookletState["window"]): string {
  if (w && w.measured > 0) {
    return `גובה החלונות נמדד על החזיתות: כל חלון לפי מה שמשורטט מעליו ומתחתיו, ובחלון שהחזית אינה מראה בבירור — האדן והמשקוף הנפוצים בבניין (${w.sill.toFixed(2)} ו־${w.head.toFixed(2)} מ', מתוך ${w.measured} חלונות שנמדדו).`;
  }
  return `גובה החלונות לפי תקן מקובל: אדן ${DWF_BUILDING_STANDARDS.window.sill.toFixed(2)} מ' ומשקוף ${DWF_BUILDING_STANDARDS.window.head.toFixed(2)} מ'.`;
}
