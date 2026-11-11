// The photographic finish over Damesek Eliezer's measured renders — PAID: one image call a view, every painting kept.
//   ALLOW_PAID_AI=1 npx tsx --conditions=react-server scripts/_damesek/paint.mts <results dir> <out dir> [view…]
// Each painting goes to <out>/<view>.jpg (and is kept as <out>/attempts/<view>-<n>.jpg) with its edge match against the render (report.json).
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { paidAiAllowed, houseSpend, costLines } = await import("@/lib/projects/building/house-cost");
if (!paidAiAllowed()) throw new Error("set ALLOW_PAID_AI=1: this run pays for its paintings");
const { GoogleGenAI } = await import("@google/genai");
const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
const { finishPass, finishPrompt, structuralMatch } = await import("@/lib/projects/building/finish");
const { runWithAiUsage } = await import("@/lib/ai-usage");
type Kind = import("@/lib/projects/building/finish").FinishKind;
const sharp = (await import("sharp")).default;

const STONE = "warm honey-toned Jerusalem limestone in coursed blocks with natural variation, fine chisel texture and crisp arrises, exactly where the render lays stone; slim dark anthracite metal window frames and mullions; deep real glazing reflecting the sky";
const EXT = `Luxury architectural photograph of a newly built synagogue in Beit Shemesh, Israel: ${STONE}. Soft raking golden-hour light, long gentle shadows, a clear sky over the Judean hills. The ground, retaining walls, ramps, kerbs, the road and the parked car exactly as the render shapes them — paint the bare earth as dry natural Judean ground with sparse low scrub only where the render has earth; add no trees, cars, people, signs or lettering. Perfect exposure, natural colour, tack-sharp, tilt-shift lens.`;
const DUSK = `Luxury architectural photograph at dusk of a newly built synagogue in Beit Shemesh, Israel: ${STONE}. A deep blue evening sky, warm interior light glowing from every window the render glazes, the wall lamps the render draws lit; the street and ground exactly as rendered. No people, no added cars, signs or lettering. Natural colour, tack-sharp.`;
const ELEV = `A straight-on rectified photograph of a synagogue facade, perfectly flat-on with no perspective, the same frame as the render: ${STONE}. The flat band of earth along the bottom is the ground cut in section: keep it a smooth solid earth section with its exact outline, never a street or lawn. Soft golden-hour light, clean pale sky. Windows, doors and lamps only where the render has them. No people, signs or lettering.`;
const INT = "Magazine-quality interior photograph of the sanctuary of a newly built Orthodox synagogue (beit midrash), eye height, verticals straight, the same frame as the render. Every pew, the bimah, the Aron Kodesh with its deep red velvet parochet and gold trim, the amud, the chandeliers, the open bookcases of sefarim, the women's-gallery front of dark smoked tinted glass and the tall arched windows stay exactly the piece they are, where they are, their size and count — add no furniture, no people, no screens, no books on the pews, no lettering or symbols. Real materials: elegant solid oak pews with visible grain and walnut ends, their seats and backs upholstered in plump rich red foam cushions with fine fabric texture exactly where the render shows red, the gallery glass dark smoked and only faintly see-through, the bookcases walnut with rows of dark leather-bound sefarim with gold spines, a walnut ark, smooth warm-white plaster walls, honed Jerusalem stone round the windows, large pale porcelain floor tiles with fine joints, a smooth white ceiling with the flush lights the render draws. Warm afternoon daylight through the arched windows in soft streaks, the chandeliers glowing gently, natural bounce light and soft contact shadows. Calm, dignified, true-to-life colour, nothing airbrushed.";

// the architect's own marketing look (his street-corner render): pale stone, soft late-morning daylight, eye level, landscaped —
// greenery the drawings do not have is added on purpose here, the building itself still exactly as rendered
const ARCH = "Premium architectural visualization, a street-level photograph of a newly built synagogue in Beit Shemesh, Israel, verticals perfectly straight. The building exactly as the render shapes it — every window, arch, cornice, tower crown, door, wall and step kept, the same count, size and place, nothing added to or removed from the building. Pale cream-ivory Jerusalem limestone, very light and fresh, finely bush-hammered, in coursed blocks with subtle natural variation and crisp arrises; slim black metal window frames; clear glass with soft sky reflections and a hint of the warm-lit interior. Soft bright late-morning daylight from a blue sky with a few soft white clouds, gentle natural shadows, no orange cast. Every window, glazed arch and glazed door stays GLASS with its slim black frame, even where the render's glass is pale or see-through — never turn a glazed opening into an open arch, a passage, a recess or blank wall. Landscaping only where the render has it: its trees as real mature trees (olive, pine, plane), its tall slim ones as cypresses, its small round bushes as Mediterranean shrubs (oleander, rosemary, lavender), and the bare earth between them as dry-garden ground cover with a few stones. Add NO planting, hedge, planter or flower bed on the paving, along the foot of the street front or in front of any window, door or arch — the paving at the building stays clear. The road, sidewalk paving and kerbs where the render has them, clean and new. No people, no extra cars, no signs, logos or lettering. Natural true-to-life colour, tack-sharp, high-end real-estate render quality.";

// the street front alone, staged as the architect's own render stages it: the neighbouring apartment block on the right, the
// planted hill with its terrace on the left, the street in front — the synagogue itself exactly as rendered
const ARCH_EAST = ARCH.replace("Landscaping only where the render has it:", "The surroundings as the render stages them: the block on the right is a NEWLY BUILT residential apartment building in a haredi neighbourhood of Beit Shemesh, finished this year — clean fresh pale Jerusalem stone in neat sawn blocks, crisp straight edges, no weathering, no stains, nothing old or worn; exactly as tall as the render draws it, the same six storeys over its lobby and the same number of window rows, its roof line at the same height in the frame; its balconies are open sukkah balconies staggered floor to floor behind solid stone parapets with a slim white rail, nothing roofing them; new white aluminium windows with white roller-shutter boxes over them; neat white louvred laundry screens on its side; solar water heaters with white tanks just showing on its roof; on the balconies only a few potted plants; the street lamps as slim dark modern lamp posts; the kerb along the road painted in red-and-white stripes; the hill on the left a terraced garden behind a low green metal fence, with a few flowering bougainvillea and oleander shrubs at its edge. Landscaping only where the render has it:");

// the other faces in the street front's look: the same stone, light and staging; the open earth in front a neat garden, all low
const GARDEN = " The open ground in front is a new landscaped garden on the same slopes the render shapes: dry-garden ground cover, pale gravel, low lavender, rosemary and ornamental grasses, a few natural stones and a narrow stone path — everything low, below the lowest window, nothing in front of any window, arch or door, no hedge.";
const VIEWS: Record<string, [Kind, string, string]> = {
  "street-south-wide": ["exterior", "the synagogue's face with its seven tall arched windows of the beit midrash, seen straight on from the garden in front of it, the round windows of its stair tower on the left, the hillside earth rising on the left and the street on the right. Under the seven windows the base is one plain flat stone wall exactly as the render draws it — no steps, no stairs, no stepped plinth; only the low block on its right end the render has. The stair tower on the left runs straight down to the earth in one plane; where it meets the arched face there is no block, ledge, setback or step at its foot — the wall under the windows is one flat rectangle from the tower to the low block, its stone courses running level and unbroken across it, its top edge one straight line under the windows' sills." + GARDEN, ARCH_EAST],
  "street-west-wide": ["exterior", "the synagogue's hill-side face, seen straight on from the hill: four arched windows and two wide glazed openings, a row of small square windows, the stair tower with its tall slit window on the right, the neighbouring apartment block's corner on the left." + GARDEN, ARCH_EAST],
  "street-north-wide": ["exterior", "the synagogue from the street at its corner toward the neighbouring apartment block: its street front with the two towers on the left, the long side face with its windows and service doors running back, the neighbour's new apartment building on the right across the narrow passage, the hillside behind. The doors on the side face stay plain doors, the side face's windows exactly where and as small as the render has them. The side face is flat stone: nothing sticks out of it but the one moulded stone cornice over the two middle doors where the render draws a ledge — no shelves, chips, boxes or ledges anywhere else. The main entrance on the street front is clear glass: the pale panel seen through it is a cabinet inside the lobby, behind the glass — nothing stands in front of the glass.", ARCH_EAST],
  "street-east-wide": ["exterior", "the synagogue's street front with its two towers, seen straight on from across the road, the neighbouring apartment block on the right and the planted hill on the left. At the foot of the right tower's tall window, just above the canopy, the render draws a glazed exit door in a heavy dark frame with a long metal pull handle: keep it clearly a door — a glass leaf in its thick dark frame, its head rail and kick rail, the handle — distinct from the window's slim bars above it. In the covered parking on the left, its left side wall is plain stone with only three small arched windows high in it (their sills above the cars' roofs, about 1.1 m up), exactly as small and as high as the render has them, a solid band of plain stone wall below them as tall as the cars — never an arcade, never arches down to the floor, no columns. The street lamp stands left of the driveway ramp, exactly where the render has it, never in front of the parking. In front of the parking the sidewalk itself slopes: a paved driveway ramp, the same sidewalk paving, falling smoothly from the sidewalk's level near the building down to a low dropped kerb at the road, flared at its two ends — that stretch of kerb plain grey concrete without the red-and-white paint. The road in front of it is the ordinary road, the same width and colour as the rest, its lane line straight on: no parking bay, no lay-by, no widened or darker asphalt, no parking area on the street; the rest of the kerb stays as it is", ARCH_EAST],
  "street-se": ["exterior", "the synagogue from across the street at its south-east corner, the seven tall arched windows on the left", ARCH],
  "street-front": ["exterior", "the synagogue's street front with its two towers, seen from across the road", ARCH],
  "street-ne": ["exterior", "the synagogue from the street at its north-east corner", ARCH],
  "street-sw": ["exterior", "the synagogue from its south-west corner", ARCH],
  "elev-east": ["elevation", "east elevation of the synagogue", ELEV],
  "elev-west": ["elevation", "west elevation of the synagogue, the street side", ELEV],
  "elev-north": ["elevation", "north elevation of the synagogue with the hillside earth on the right", ELEV],
  "elev-south": ["elevation", "south elevation with its seven tall arched windows of the beit midrash", ELEV],
  hero: ["exterior", "the synagogue from the street corner", EXT],
  "perspective-ne": ["exterior", "aerial view of the synagogue from the north-east", EXT],
  "perspective-nw": ["exterior", "aerial view of the synagogue from the north-west", EXT],
  "perspective-sw": ["exterior", "aerial view of the synagogue from the south-west", EXT],
  "perspective-se": ["exterior", "aerial view of the synagogue from the south-east", EXT],
  "dusk-street": ["exterior", "the synagogue's street front at dusk", DUSK],
  "court-north": ["exterior", "the sunken north court beside the synagogue seen from above", EXT],
  "interior-beit-midrash": ["interior", "the beit midrash looking east to the Aron Kodesh", INT],
  "interior-hall-west": ["interior", "the beit midrash looking west from the ark to the women's gallery", INT],
  "interior-hall-from-gallery": ["interior", "the beit midrash seen from the women's gallery through its glass front", INT],
  "interior-gallery": ["interior", "the women's gallery over the beit midrash", INT],
};

const [dir, out, ...only] = process.argv.slice(2) as [string, string, ...string[]];
fs.mkdirSync(out, { recursive: true });
const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
const spend = houseSpend({ budgetIls: 15 });
const report: Array<{ view: string; model?: string; match?: number; ms: number }> = [];
await runWithAiUsage(spend.ledger, async () => {
  for (const [view, [kind, subject, look]] of Object.entries(VIEWS)) {
    if (only.length && !only.includes(view)) continue;
    const render = fs.readFileSync(path.join(dir, `${view}.jpg`));
    const meta = await sharp(render).metadata();
    const t = Date.now();
    const got = await finishPass(client, finishPrompt(kind, subject, { look }), render);
    if (!got) {
      console.log(`${view}: no picture came back — stopping (account or quota?)`);
      report.push({ view, ms: Date.now() - t });
      break;
    }
    const fitted = await sharp(got.image).resize(meta.width, meta.height, { fit: "fill" }).jpeg({ quality: 93 }).toBuffer();
    const match = await structuralMatch(render, fitted);
    // every paid painting is kept: <out>/attempts/<view>-<n>.jpg never overwritten; <out>/<view>.jpg is the latest
    const att = path.join(out, "attempts");
    fs.mkdirSync(att, { recursive: true });
    let n = 1;
    while (fs.existsSync(path.join(att, `${view}-${n}.jpg`))) n++;
    fs.writeFileSync(path.join(att, `${view}-${n}.jpg`), fitted);
    fs.writeFileSync(path.join(out, `${view}.jpg`), fitted);
    report.push({ view, model: got.model, match, ms: Date.now() - t });
    console.log(`${view}: ${got.model} match ${match.toFixed(3)} (${Date.now() - t} ms)`);
  }
});
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
for (const line of costLines(spend)) console.log(line);
