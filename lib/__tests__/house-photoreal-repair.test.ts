/**
 * @jest-environment node
 */
import type { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { addedRailings, finishPrompt, localMatch, nearestAspectRatio } from "@/lib/projects/building/finish";
import {
  affords,
  attemptEstimateUsd,
  costLines,
  costOf,
  costReport,
  defaultHouseBudgetIls,
  estimateHousePainting,
  HOUSE_IMAGE_TOKENS_BY_SIZE,
  HOUSE_USD_TO_ILS_ESTIMATE,
  housePlanImageSize,
  housePlanWhole,
  houseSpend,
  imageCallEstimateUsd,
  paidAiAllowed,
  reserve,
  spentSoFar,
  textCallEstimateUsd,
  withPictureLedger,
} from "@/lib/projects/building/house-cost";
import {
  houseLookOf,
  interiorFault,
  nextPass,
  paintHousePictures,
  paintingPrompt,
  passTimeoutMs,
  PLAN_RULES,
  PLAN_TILE_PROMPT,
  PLAN_WHOLE_PROMPT,
  planTilePrompt,
  planWholePrompt,
  planYardPrompt,
  planLightRule,
  planRules,
  PLAN_LIGHT_GOLDEN,
  repairPrompt,
  type Verdict,
} from "@/lib/projects/building/house-photoreal";
import { memoryHouseStore, paintingCache, paintingKey } from "@/lib/projects/building/house-store";
import { FLOORPLAN_VIZ_PRESETS, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { recordAiUsage } from "@/lib/ai-usage";

const MODEL = "gemini-3.1-flash-image";

jest.setTimeout(30_000);

jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => ["gemini-3.1-flash-image"],
  GEMINI_IMAGE_NANO_BANANA_21_MODEL: "gemini-nano-banana-2.1",
  GEMINI_IMAGE_LITE_MODEL: "gemini-3.1-flash-lite-image",
  GEMINI_STABLE_TEXT_MODEL: "gemini-3.7-flash",
}));
jest.mock("@/lib/projects/floorplan-finish-still", () => ({ FINISH_MIN_EDGES: 0.6, FINISH_MIN_MASSES: 0.5 }));

const W = 480;
const H = 320;

/** A house against the sky: a plain roof band, a wall with two windows, and paving. */
function house(): Uint8Array {
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: [number, number, number] = [175, 200, 230];
      if (y >= 90 && x >= 60 && x < 420) c = y < 150 ? [120, 120, 125] : [170, 140, 105];
      if (y >= 170 && y < 230 && ((x >= 110 && x < 170) || (x >= 310 && x < 370))) c = [40, 50, 60];
      if (y >= 270) c = [150, 150, 145];
      const i = (y * W + x) * 3;
      [px[i], px[i + 1], px[i + 2]] = c;
    }
  }
  return px;
}

const jpeg = (px: Uint8Array) => sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();

/** The same house painted: warmer, with a fine grain over every surface, and nothing else. */
function textured(px: Uint8Array): Uint8Array {
  const out = Uint8Array.from(px);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < W * H; k++) {
    const grain = (rand() - 0.5) * 8;
    // Warmed as a golden-hour painting is: far enough from the render to be painted (UNPAINTED_DIFF).
    out[k * 3] = Math.max(0, Math.min(255, px[k * 3]! + 14 + grain));
    out[k * 3 + 1] = Math.max(0, Math.min(255, px[k * 3 + 1]! + 8 + grain));
    out[k * 3 + 2] = Math.max(0, Math.min(255, px[k * 3 + 2]! - 22 + grain));
  }
  return out;
}

/** Something stood on the roof: a jumble of light and dark pieces, edges every way. */
function withThingOnRoof(px: Uint8Array): Uint8Array {
  const out = Uint8Array.from(px);
  let seed = 3;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cells = new Map<string, number>();
  for (let y = 100; y < 142; y++) {
    for (let x = 200; x < 260; x++) {
      const key = `${Math.floor(x / 5)},${Math.floor(y / 5)}`;
      if (!cells.has(key)) cells.set(key, rand() < 0.5 ? 30 : 230);
      const v = cells.get(key)!;
      const i = (y * W + x) * 3;
      [out[i], out[i + 1], out[i + 2]] = [v, v * 0.9, v * 0.8];
    }
  }
  return out;
}

/** The house moved: what a painting off the render's frame looks like. */
function shifted(px: Uint8Array): Uint8Array {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, x + 70);
      const sy = Math.max(0, y - 40);
      for (let c = 0; c < 3; c++) out[(y * W + x) * 3 + c] = px[(sy * W + sx) * 3 + c]!;
    }
  }
  return out;
}

const style = { promptBlock: "" } as unknown as FloorplanVizStyleKit;

/** A Gemini client that answers each image call with the next picture, and keeps what it was sent. */
function fakeGemini(answers: Buffer[]) {
  const sent: Array<{ prompt: string; images: number }> = [];
  const client = {
    models: {
      generateContent: jest.fn(async (req: { contents: Array<{ parts: Array<{ text?: string; inlineData?: unknown }> }> }) => {
        const parts = req.contents[0]!.parts;
        sent.push({ prompt: parts.find((p) => p.text)?.text ?? "", images: parts.filter((p) => p.inlineData).length });
        const image = answers[Math.min(sent.length - 1, answers.length - 1)]!;
        return {
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: image.toString("base64") } }] } }],
          usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 1120, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }] },
        };
      }),
    },
  };
  return { client: client as unknown as GoogleGenAI, sent };
}

function store(entries: Record<string, Buffer>) {
  const pics = new Map(Object.entries(entries));
  return { pics, api: { names: () => [...pics.keys()], get: (n: string) => pics.get(n), set: (n: string, d: Buffer) => void pics.set(n, d) } };
}

describe("a painting is checked part by part", () => {
  it("refuses a thing invented on the roof, and says where", async () => {
    const render = await jpeg(house());
    const r = await localMatch(render, await jpeg(textured(withThingOnRoof(house()))));
    expect(r.invented.length).toBeGreaterThan(0);
    expect(r.reason).toMatch(/invented object at (top|middle)/);
  });

  it("holds a painting that only adds texture and colour", async () => {
    const render = await jpeg(house());
    const r = await localMatch(render, await jpeg(textured(house())));
    expect(r.reason).toBeNull();
  });

  it("lets the far land past the plot hold a distant town, and still refuses a thing on the roof", async () => {
    // The render's empty land under the sky, edge to edge, the house in front of it.
    const withLand = (px: Uint8Array) => {
      const out = Uint8Array.from(px);
      for (let y = 40; y < 90; y++) for (let x = 0; x < W; x++) [out[(y * W + x) * 3], out[(y * W + x) * 3 + 1], out[(y * W + x) * 3 + 2]] = [188, 181, 163];
      return out;
    };
    const town = (px: Uint8Array) => {
      const out = Uint8Array.from(px);
      for (let y = 55; y < 85; y++) for (let x = 0; x < 50; x++) {
        const v = (Math.floor(x / 5) + Math.floor(y / 5)) % 2 ? 230 : 60;
        [out[(y * W + x) * 3], out[(y * W + x) * 3 + 1], out[(y * W + x) * 3 + 2]] = [v, v * 0.95, v * 0.85];
      }
      return out;
    };
    const render = await jpeg(withLand(house()));
    expect((await localMatch(render, await jpeg(textured(town(withLand(house())))))).reason).toBeNull();
    expect((await localMatch(render, await jpeg(textured(withThingOnRoof(town(withLand(house()))))))).reason).toMatch(/invented object/);
  });
});

/**
 * Paving with two stone garden walls along it. The render draws a railing on
 * the lower wall only — a top and a bottom rail, its bars too fine to show.
 */
const RW = 600;
const RH = 300;
function walls(options: { renderRail: boolean; barsOn: Array<[number, number]> }): Promise<Buffer> {
  const px = new Uint8Array(RW * RH * 3);
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      let c: [number, number, number] = [170, 170, 165];
      if ((y >= 100 && y < 120) || (y >= 183 && y < 200)) c = [205, 192, 160];
      if (options.renderRail && x >= 100 && x < 400 && ((y >= 165 && y < 168) || (y >= 180 && y < 183))) c = [60, 62, 66];
      for (const [top, bottom] of options.barsOn) {
        if (x >= 100 && x < 400 && y >= top && y < bottom && x % 4 < 2) c = [40, 42, 46];
      }
      const i = (y * RW + x) * 3;
      [px[i], px[i + 1], px[i + 2]] = c;
    }
  }
  return sharp(Buffer.from(px), { raw: { width: RW, height: RH, channels: 3 } }).png().toBuffer();
}

describe("a railing the painting set on a bare wall", () => {
  it("is found on the wall the render leaves bare, and placed", async () => {
    const render = await walls({ renderRail: true, barsOn: [] });
    const painting = await walls({ renderRail: true, barsOn: [[80, 100], [165, 183]] });
    const found = await addedRailings(render, painting);
    expect(found).toHaveLength(1);
    expect(found[0]!.box.y).toBeLessThan(0.34);
    expect(found[0]!.place).toMatch(/^(top|middle)/);
  });

  it("is not found where the render draws the railing the painting gives bars", async () => {
    const render = await walls({ renderRail: true, barsOn: [] });
    const painting = await walls({ renderRail: true, barsOn: [[165, 183]] });
    expect(await addedRailings(render, painting)).toEqual([]);
  });

  it("is left to the view straight down, where a railing has no bars to count", async () => {
    const render = await walls({ renderRail: false, barsOn: [] });
    const painting = await walls({ renderRail: false, barsOn: [[80, 100]] });
    expect((await localMatch(render, painting)).railings).toHaveLength(1);
    expect((await localMatch(render, painting, { railings: false })).railings).toEqual([]);
  });
});

describe("what follows a refused painting", () => {
  const verdict = (v: Partial<Verdict>): Verdict => ({ edges: 0.8, masses: 0.8, global: true, local: null, held: false, ...v });

  it("paints first, and afresh after no picture", () => {
    expect(nextPass(null)).toEqual({ how: "paint" });
  });

  it("repaints a painting that drifted off the frame, whatever its parts", () => {
    const fault = { place: "top centre", box: { x: 0.4, y: 0, w: 0.1, h: 0.1 } };
    expect(nextPass(verdict({ global: false, edges: 0.41, masses: 0.7, local: { invented: [fault], lost: [], railings: [], reason: "x" } }))).toEqual({ how: "repaint", edges: 0.41, masses: 0.7 });
  });

  it("repairs a painting that holds the frame and fails in a part, naming the part", () => {
    const fault = { place: "top centre", box: { x: 0.4, y: 0, w: 0.1, h: 0.1 } };
    const lost = { place: "middle right", box: { x: 0.7, y: 0.4, w: 0.1, h: 0.1 } };
    const rail = { place: "bottom right", box: { x: 0.75, y: 0.7, w: 0.15, h: 0.2 } };
    const pass = nextPass(
      verdict({ local: { invented: [fault], lost: [lost], railings: [rail], reason: "invented object at top centre; added railing at bottom right; lost structure at middle right" } }),
    );
    expect(pass.how).toBe("repair");
    const prompt = repairPrompt({ kind: "exterior" }, pass as Extract<typeof pass, { how: "repair" }>);
    expect(prompt).toContain("At the top centre of image 1 there is something image 2 does not have");
    expect(prompt).toContain("At the bottom right of image 1 a railing or fence stands on a wall where image 2 has none");
    expect(prompt).toContain("At the middle right of image 1, a line of image 2");
    expect(prompt).toMatch(/no furniture.*posts/);
    expect(prompt).toMatch(/A railing or fence only where the render draws one/);
  });
});

describe("painting a house's pictures, with a mocked Gemini", () => {
  it("repairs an invention with both images and keeps the repaired painting", async () => {
    const render = await jpeg(house());
    const good = await jpeg(textured(house()));
    const { client, sent } = fakeGemini([await jpeg(textured(withThingOnRoof(house()))), good]);
    const { pics, api } = store({ "view-hero.jpg": render });
    const steps: string[] = [];
    const done = await paintHousePictures(api, { subject: "a house", style, client, say: (s) => steps.push(s), concurrency: 1 });
    expect(done).toEqual(["view-hero.jpg"]);
    expect(sent.map((s) => s.images)).toEqual([1, 2]);
    expect(sent[1]!.prompt).toContain("refused against the render: invented object at");
    expect(pics.get("view-hero.jpg")!.equals(good)).toBe(true);
    expect(steps.some((s) => /paint 1: .*refused: invented object at/.test(s))).toBe(true);
    expect(steps.some((s) => /repair 2 .*held/.test(s))).toBe(true);
    expect(steps.some((s) => /view-hero\.jpg cost: 2 calls, 2 images/.test(s))).toBe(true);
  });

  it("repaints a drifted painting from the render alone, told it drifted", async () => {
    const render = await jpeg(house());
    const { client, sent } = fakeGemini([await jpeg(textured(shifted(house()))), await jpeg(textured(house()))]);
    const { api } = store({ "view-hero.jpg": render });
    const steps: string[] = [];
    expect(await paintHousePictures(api, { subject: "a house", style, client, say: (s) => steps.push(s), concurrency: 1 })).toEqual(["view-hero.jpg"]);
    expect(sent.map((s) => s.images)).toEqual([1, 1]);
    expect(sent[1]!.prompt).toContain("drifted off its frame");
    expect(steps.some((s) => /refused: drifted from the render's frame/.test(s))).toBe(true);
  });

  it("refuses a painting that adds writing, and has it taken out with the render beside it", async () => {
    const render = await jpeg(house());
    const good = await jpeg(textured(house()));
    const { client, sent } = fakeGemini([good, good]);
    const { api } = store({ "view-elev-south.jpg": render, "sheet-elev-south.jpg": render });
    const steps: string[] = [];
    let asked = 0;
    const fidelity = async () => (++asked === 1 ? [{ kind: "added" as const, what: "plaque", where: "bottom", text: "דגם A" }] : null);
    expect(await paintHousePictures(api, { subject: "a house", style, client, say: (s) => steps.push(s), concurrency: 1, fidelity })).toEqual(["view-elev-south.jpg"]);
    expect(sent.map((s) => s.images)).toEqual([1, 2]);
    expect(sent[1]!.prompt).toContain('plaque added at the bottom ("דגם A")');
    expect(sent[1]!.prompt).toContain("At the bottom of image 1 there is something image 2 does not have there");
    expect(steps.some((s) => /paint 1: .*refused: plaque added/.test(s))).toBe(true);
  });

  it("refuses a painting that lost a car the render parks, and has it put back", async () => {
    const render = await jpeg(house());
    const good = await jpeg(textured(house()));
    const { client, sent } = fakeGemini([good, good]);
    const { api } = store({ "view-aerial-top.jpg": render });
    let asked = 0;
    const fidelity = async () => (++asked === 1 ? [{ kind: "missing" as const, what: "car", where: "bottom-left", text: "" }] : null);
    expect(await paintHousePictures(api, { subject: "a house", style, client, concurrency: 1, fidelity })).toEqual(["view-aerial-top.jpg"]);
    expect(sent[1]!.prompt).toContain("At the bottom-left of image 1, a line of image 2");
  });

  it("does not ask after writing on a furnished plan, whose render carries its own label", async () => {
    const render = await jpeg(house());
    const { client } = fakeGemini([await jpeg(textured(house()))]);
    const { api } = store({ "unit-1-lower.jpg": render });
    const fidelity = jest.fn(async () => [{ kind: "added" as const, what: "label", where: "bottom", text: "בית 1" }]);
    await paintHousePictures(api, { subject: "a house", style, client, concurrency: 1, fidelity });
    expect(fidelity).not.toHaveBeenCalled();
  });

  it("makes three image calls at most — the estimate's number — then keeps the render", async () => {
    const render = await jpeg(house());
    const { client, sent } = fakeGemini([await jpeg(textured(withThingOnRoof(house())))]);
    const { pics, api } = store({ "view-hero.jpg": render });
    const steps: string[] = [];
    expect(await paintHousePictures(api, { subject: "a house", style, client, say: (s) => steps.push(s), concurrency: 1 })).toEqual([]);
    expect(sent).toHaveLength(3);
    expect(estimateHousePainting({ pictures: 1, model: MODEL }).attempts).toBe(3);
    expect(pics.get("view-hero.jpg")).toBe(render);
    expect(steps.some((s) => /no painting held the render/.test(s))).toBe(true);
  });

  it("does not paint an elevation no sheet draws: the booklet does not show it", async () => {
    const render = await jpeg(house());
    const { client, sent } = fakeGemini([await jpeg(textured(house()))]);
    const { api } = store({ "view-elev-east.jpg": render, "view-elev-north.jpg": render, "sheet-elev-north.jpg": render });
    expect(await paintHousePictures(api, { subject: "a house", style, client, concurrency: 1, fidelity: async () => null })).toEqual(["view-elev-north.jpg"]);
    expect(sent).toHaveLength(1);
  });

  it("holds the calls in flight against the ceiling: pictures painting at once cannot pass it", async () => {
    const spend = houseSpend({ budgetIls: attemptEstimateUsd(MODEL, 1) * HOUSE_USD_TO_ILS_ESTIMATE * 1.5 });
    const first = reserve(spend, MODEL, 1);
    expect(first).not.toBeNull();
    expect(reserve(spend, MODEL, 1)).toBeNull();
    expect(spend.stopped).toBe(true);
    first!();
    expect(spend.reservedIls).toBe(0);
  });

  it("asks each room from eye height, never 'straight from above', and with no props", () => {
    const room = houseLookOf("view-room-living.jpg", FLOORPLAN_VIZ_PRESETS.haredi_classic)!;
    expect(room.kind).toBe("interior");
    const prompt = finishPrompt(room.kind, "a house", { look: room.look });
    expect(prompt).toContain("from eye height");
    expect(prompt).not.toMatch(/straight from above/i);
    expect(prompt).not.toMatch(/vase|throw on the sofa|sefarim cabinet|fruit bowl|every lamp glowing/i);
  });
});

describe("the job's spend and its budget", () => {
  it("costs a ledger's calls and pictures in dollars and shekels", () => {
    const cost = costOf({ [MODEL]: { calls: 2, inputTokens: 3000, outputTokens: 0, imageTokens: 2240, outputImages: 2 } }, 4);
    expect(cost.calls).toBe(2);
    expect(cost.images).toBe(2);
    expect(cost.usd).toBeCloseTo((3000 * 0.5 + 2240 * 60) / 1e6, 6);
    expect(cost.ils).toBeCloseTo(cost.usd * 4, 6);
  });

  it("refuses the call that would pass the budget, and stays stopped", async () => {
    const spend = houseSpend({ budgetIls: 0.4, usdToIls: 3.7 });
    expect(affords(spend, MODEL, 1)).toBe(true);
    await withPictureLedger(spend, async () => recordAiUsage(MODEL, { inputTokens: 1500, imageTokens: 1120, outputImages: 1 }));
    expect(spentSoFar(spend).images).toBe(1);
    expect(affords(spend, MODEL, 2)).toBe(false);
    expect(spend.stopped).toBe(true);
    expect(affords(spend, MODEL, 1)).toBe(false);
  });

  it("has no ceiling without a budget", () => {
    const spend = houseSpend({ budgetIls: null });
    expect(affords(spend, MODEL, 2)).toBe(true);
    expect(imageCallEstimateUsd(MODEL, 2)).toBeGreaterThan(0.067);
  });

  it("stops painting at the budget and keeps the remaining renders unpainted", async () => {
    const hero = await jpeg(house());
    const aerial = await jpeg(house());
    const { client, sent } = fakeGemini([await jpeg(textured(withThingOnRoof(house())))]);
    const { pics, api } = store({ "view-hero.jpg": hero, "view-aerial-se.jpg": aerial });
    const spend = houseSpend({ budgetIls: 0.2, usdToIls: 3.7 });
    const steps: string[] = [];
    expect(await paintHousePictures(api, { subject: "a house", style, client, spend, say: (s) => steps.push(s), concurrency: 1 })).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(spend.stopped).toBe(true);
    expect(spend.skipped).toEqual(["view-aerial-se.jpg"]);
    expect(pics.get("view-aerial-se.jpg")).toBe(aerial);
    expect(spentSoFar(spend).calls).toBe(1);
    expect(spentSoFar(spend).ils).toBeLessThanOrEqual(0.2);
    expect(steps.some((s) => /would pass the budget of ₪0.2/.test(s))).toBe(true);
    expect(steps.some((s) => /view-aerial-se\.jpg: not painted — the budget/.test(s))).toBe(true);
    expect(spend.pictures.map((p) => p.outcome)).toEqual(["kept-render", "budget"]);
  });
});

describe("a render that has not changed is not paid for twice", () => {
  it("keys a painting by its render, its prompt and its model", () => {
    const a = Buffer.from("render");
    expect(paintingKey(a, "p", MODEL)).toBe(paintingKey(Buffer.from("render"), "p", MODEL));
    expect(paintingKey(a, "p", MODEL)).not.toBe(paintingKey(Buffer.from("render!"), "p", MODEL));
    expect(paintingKey(a, "p", MODEL)).not.toBe(paintingKey(a, "q", MODEL));
    expect(paintingKey(a, "p", MODEL)).not.toBe(paintingKey(a, "p", "gemini-3-pro-image"));
  });

  it("reuses the held painting of the same render, with no call", async () => {
    const render = await jpeg(house());
    const good = await jpeg(textured(house()));
    const files = memoryHouseStore();
    const cache = paintingCache(files);

    const first = fakeGemini([good]);
    const one = store({ "view-hero.jpg": render });
    const spend1 = houseSpend({ budgetIls: null });
    expect(await paintHousePictures(one.api, { subject: "a house", style, client: first.client, spend: spend1, cache, group: "A", concurrency: 1 })).toEqual(["view-hero.jpg"]);
    expect(first.sent).toHaveLength(1);
    expect(files.files.size).toBe(1);
    expect(spend1.pictures).toMatchObject([{ group: "A", name: "view-hero.jpg", outcome: "painted", calls: 1 }]);

    const again = fakeGemini([good]);
    const two = store({ "view-hero.jpg": render });
    const spend2 = houseSpend({ budgetIls: null });
    const steps: string[] = [];
    expect(await paintHousePictures(two.api, { subject: "a house", style, client: again.client, spend: spend2, cache, group: "A", say: (s) => steps.push(s), concurrency: 1 })).toEqual(["view-hero.jpg"]);
    expect(again.sent).toHaveLength(0);
    expect(two.pics.get("view-hero.jpg")!.equals(good)).toBe(true);
    expect(spend2.pictures).toMatchObject([{ outcome: "reused", calls: 0, ils: 0 }]);
    expect(steps.some((s) => /unchanged — its approved painting is reused/.test(s))).toBe(true);
  });

  it("paints again a render that changed", async () => {
    const files = memoryHouseStore();
    const cache = paintingCache(files);
    const good = await jpeg(textured(house()));
    await paintHousePictures(store({ "view-hero.jpg": await jpeg(house()) }).api, { subject: "a house", style, client: fakeGemini([good]).client, cache, concurrency: 1 });
    const moved = fakeGemini([await jpeg(textured(withThingOnRoof(house())))]);
    await paintHousePictures(store({ "view-hero.jpg": await jpeg(withThingOnRoof(house())) }).api, { subject: "a house", style, client: moved.client, cache, concurrency: 1 });
    expect(moved.sent.length).toBeGreaterThan(0);
  });
});

describe("the local check inside a flat", () => {
  const at = (place: string) => ({ place, box: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 } });

  it("holds one lost patch where the painting keeps the plan's lines", () => {
    expect(interiorFault(0.69, [at("middle centre")])).toBeNull();
    expect(interiorFault(0.9, [])).toBeNull();
  });

  it("refuses two lost patches, or one where the lines went too", () => {
    expect(interiorFault(0.8, [at("top left"), at("bottom right")])).toMatch(/lost structure at top left, bottom right/);
    expect(interiorFault(0.63, [at("middle centre")])).toMatch(/lost structure at middle centre/);
  });
});

describe("what a run will cost, and what it cost", () => {
  it("estimates the first painting of each picture and the most three attempts come to, each with its vision check", () => {
    const e = estimateHousePainting({ pictures: 10, model: MODEL, reused: 4, usdToIls: 3.7 });
    expect(e.toPaint).toBe(6);
    expect(e.reused).toBe(4);
    expect(e.perPictureIls).toBeCloseTo((imageCallEstimateUsd(MODEL, 1) + textCallEstimateUsd(2)) * 3.7, 6);
    expect(e.mostIls).toBeCloseTo(6 * (attemptEstimateUsd(MODEL, 1) + 2 * attemptEstimateUsd(MODEL, 2)) * 3.7, 6);
    expect(e.likelyIls).toBeLessThan(e.mostIls);
    expect(estimateHousePainting({ pictures: 3, model: MODEL, reused: 5 }).toPaint).toBe(0);
  });

  it("reports picture by picture, by model, and in all", () => {
    const spend = houseSpend({ budgetIls: null });
    const c = { calls: 1, images: 1, usd: 0.1, ils: 0.37 };
    spend.pictures.push({ group: "A", name: "x.jpg", outcome: "painted", ...c }, { group: "A", name: "y.jpg", outcome: "reused", calls: 0, images: 0, usd: 0, ils: 0 });
    spend.pictures.push({ group: "B", name: "x.jpg", outcome: "kept-render", ...c });
    const r = costReport(spend);
    expect(r.byGroup).toEqual([
      { group: "A", calls: 1, images: 1, usd: 0.1, ils: 0.37, painted: 1, reused: 1, kept: 0 },
      { group: "B", calls: 1, images: 1, usd: 0.1, ils: 0.37, painted: 0, reused: 0, kept: 1 },
    ]);
    expect(costLines(spend).some((l) => /^cost A: 1 painted, 1 reused, 0 kept as renders/.test(l))).toBe(true);
  });

  it("caps a run at ₪50 unless the server says otherwise", () => {
    const before = process.env.HOUSE_BOOKLET_BUDGET_ILS;
    delete process.env.HOUSE_BOOKLET_BUDGET_ILS;
    expect(defaultHouseBudgetIls()).toBe(50);
    process.env.HOUSE_BOOKLET_BUDGET_ILS = "80";
    expect(defaultHouseBudgetIls()).toBe(80);
    if (before == null) delete process.env.HOUSE_BOOKLET_BUDGET_ILS;
    else process.env.HOUSE_BOOKLET_BUDGET_ILS = before;
  });

  it("makes no paid call from a script unless told to", async () => {
    const env = { runtime: process.env.NEXT_RUNTIME, allow: process.env.ALLOW_PAID_AI };
    delete process.env.NEXT_RUNTIME;
    delete process.env.ALLOW_PAID_AI;
    expect(paidAiAllowed()).toBe(false);
    const steps: string[] = [];
    expect(await paintHousePictures(store({ "view-hero.jpg": await jpeg(house()) }).api, { subject: "a house", style, say: (s) => steps.push(s) })).toEqual([]);
    expect(steps.some((s) => /paid image calls are off/.test(s))).toBe(true);
    process.env.ALLOW_PAID_AI = "1";
    expect(paidAiAllowed()).toBe(true);
    if (env.runtime != null) process.env.NEXT_RUNTIME = env.runtime;
    if (env.allow == null) delete process.env.ALLOW_PAID_AI;
    else process.env.ALLOW_PAID_AI = env.allow;
  });
});

describe("a whole storey's plan painted in one call", () => {
  const NB = "gemini-nano-banana-2.1";

  it("costs a 4K picture by its tokens: $0.113 against $0.0336 at 1K", () => {
    const now = new Date();
    const [k1, k4] = [imageCallEstimateUsd(NB, 1, now, "1K"), imageCallEstimateUsd(NB, 1, now, "4K")];
    expect(k4 - k1).toBeGreaterThanOrEqual(((HOUSE_IMAGE_TOKENS_BY_SIZE["4K"] - HOUSE_IMAGE_TOKENS_BY_SIZE["1K"]) * 30) / 1e6 - 1e-9);
    // Its thinking too: the pilot's 4K call (5,782 in, 1,840 thought, 3,780 image tokens) cost $0.136; the estimate holds at least that.
    expect(imageCallEstimateUsd(NB, 4, now, "4K")).toBeGreaterThanOrEqual(0.1359);
    expect(HOUSE_IMAGE_TOKENS_BY_SIZE["4K"] * 30e-6).toBeCloseTo(0.113, 3);
    expect(imageCallEstimateUsd(NB, 1)).toBeCloseTo(k1, 9);
    expect(estimateHousePainting({ pictures: 1, model: NB, attempts: 1, size: "4K" }).mostIls).toBeCloseTo(attemptEstimateUsd(NB, 1, now, "4K") * HOUSE_USD_TO_ILS_ESTIMATE, 6);
  });

  it("is asked for by HOUSE_PLAN_WHOLE, at HOUSE_PLAN_SIZE or 4K, given longer to answer", () => {
    const before = { whole: process.env.HOUSE_PLAN_WHOLE, size: process.env.HOUSE_PLAN_SIZE };
    delete process.env.HOUSE_PLAN_WHOLE;
    delete process.env.HOUSE_PLAN_SIZE;
    expect(housePlanWhole()).toBe(false);
    expect(housePlanImageSize()).toBe("4K");
    process.env.HOUSE_PLAN_WHOLE = "1";
    process.env.HOUSE_PLAN_SIZE = "2k";
    expect(housePlanWhole()).toBe(true);
    expect(housePlanImageSize()).toBe("2K");
    process.env.HOUSE_PLAN_SIZE = "8K";
    expect(housePlanImageSize()).toBe("4K");
    for (const [k, v] of [["HOUSE_PLAN_WHOLE", before.whole], ["HOUSE_PLAN_SIZE", before.size]] as const) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
    expect(passTimeoutMs("4K")).toBeGreaterThan(passTimeoutMs("2K"));
    expect(passTimeoutMs("2K")).toBeGreaterThan(passTimeoutMs("1K"));
  });

  it("frames to the strips only where allowed", () => {
    expect(nearestAspectRatio(4.2)).toBe("21:9");
    expect(nearestAspectRatio(4.2, true)).toBe("4:1");
    expect(nearestAspectRatio(16 / 10, true)).toBe(nearestAspectRatio(16 / 10));
  });

  it("is looked at as both homes and the yard, one set of materials, keyed by its size", () => {
    const before = process.env.HOUSE_PLAN_GOLDEN;
    delete process.env.HOUSE_PLAN_GOLDEN;
    const kind = houseLookOf("view-planwhole-floor-1.jpg", style)!;
    expect(kind).toMatchObject({ kind: "cutaway", whole: true, imageSize: "4K", sheet: "mask-floor-1.png" });
    expect(kind.look).toBe(planWholePrompt());
    expect(planWholePrompt()).toMatch(/THE TWO HOMES ARE ONE DESIGN/);
    expect(planWholePrompt()).toMatch(/STAIRS: /);
    expect(planWholePrompt()).toMatch(/LAUNDRY \/ WASHING MACHINE/);
    expect(planTilePrompt().startsWith("INPUT: an exact 3D render of part of a house's floor plan")).toBe(true);
    expect(PLAN_TILE_PROMPT.startsWith("INPUT: an exact 3D render of part of a house's floor plan")).toBe(true);
    expect(PLAN_WHOLE_PROMPT).toMatch(/THE TWO HOMES ARE ONE DESIGN/);
    expect(paintingPrompt("a house", kind)).not.toBe(paintingPrompt("a house", { ...kind, imageSize: "1K" }));
    if (before == null) delete process.env.HOUSE_PLAN_GOLDEN;
    else process.env.HOUSE_PLAN_GOLDEN = before;
  });

  it("keeps one conflict-free plan-paint rule set (tile, whole, FLUX)", () => {
    const beforeG = process.env.HOUSE_PLAN_GOLDEN;
    const beforeE = process.env.HOUSE_PLAN_EVEN;
    delete process.env.HOUSE_PLAN_GOLDEN;
    delete process.env.HOUSE_PLAN_EVEN;
    const tile = planTilePrompt();
    const whole = planWholePrompt();
    for (const p of [tile, whole]) {
      expect(p).toMatch(/washing machine/);
      expect(p).toMatch(/not as a toilet/);
      expect(p).toMatch(/clear glass railing in a slim black (metal )?frame/);
      expect(p).toMatch(/never omit/);
      expect(p).toMatch(/never turn it into a solid parapet/);
      expect(p).toMatch(/do not redesign, do not improve, do not invent/);
      expect(p).toMatch(/room names/);
      expect(p).toMatch(/Two bowls in one shared rim stay one double sink/);
      expect(p).toMatch(/Two sinks with worktop between them stay two separate single sinks/);
      expect(p).toMatch(/paint it as a sofa, not as a bed/);
      expect(p).toMatch(/two flights side by side climbing in opposite directions/);
      expect(p).toMatch(/WARM AND BRIGHT/);
      expect(p).not.toMatch(/LIGHT, THE SAME IN EVERY PART/);
      expect(p).not.toMatch(/sefarim|fruit bowl|add rugs|add furniture/i);
      expect(p).not.toMatch(/always (a )?double sink|force a double/i);
      expect(p).toMatch(/from straight above|straight down from above/);
    }
    const rules = planRules();
    expect(rules.some((r) => /LAUNDRY \/ WASHING MACHINE/.test(r))).toBe(true);
    expect(tile).toContain(rules[0]!);
    expect(whole).toContain(rules[0]!);
    expect(PLAN_RULES.some((r) => /LAUNDRY \/ WASHING MACHINE/.test(r))).toBe(true);
    if (beforeG == null) delete process.env.HOUSE_PLAN_GOLDEN;
    else process.env.HOUSE_PLAN_GOLDEN = beforeG;
    if (beforeE == null) delete process.env.HOUSE_PLAN_EVEN;
    else process.env.HOUSE_PLAN_EVEN = beforeE;
  });

  it("default warm-bright plan light; HOUSE_PLAN_EVEN=1 restores even overhead without invent language", () => {
    const beforeG = process.env.HOUSE_PLAN_GOLDEN;
    const beforeE = process.env.HOUSE_PLAN_EVEN;
    delete process.env.HOUSE_PLAN_GOLDEN;
    delete process.env.HOUSE_PLAN_EVEN;
    expect(planLightRule()).toBe(PLAN_LIGHT_GOLDEN);
    for (const p of [planTilePrompt(), planWholePrompt(), planYardPrompt()]) {
      expect(p).toMatch(/WARM AND BRIGHT/);
      expect(p).toMatch(/do not redesign, do not improve, do not invent/);
      expect(p).not.toMatch(/sefarim|fruit bowl|add rugs|add furniture/i);
      expect(p).toMatch(/clear glass railing/i);
    }
    expect(planWholePrompt()).toMatch(/concealed warm|short, faint contact|honey/i);
    expect(planWholePrompt()).toMatch(/STRUCTURE LOCK/);
    expect(planWholePrompt()).toMatch(/Do NOT invent steps|beside a toilet/i);
    expect(planWholePrompt()).toMatch(/VESTIBULE BESIDE A WET ROOM/);
    expect(planWholePrompt()).toMatch(/never in bathrooms, WC alcoves/i);
    expect(houseLookOf("view-planwhole-floor-0.jpg", style)!.look).toBe(planWholePrompt());
    process.env.HOUSE_PLAN_EVEN = "1";
    expect(planLightRule()).not.toBe(PLAN_LIGHT_GOLDEN);
    expect(planTilePrompt()).toMatch(/LIGHT, THE SAME IN EVERY PART/);
    expect(planTilePrompt()).not.toMatch(/WARM AND BRIGHT OVER THE PLAN/);
    if (beforeG == null) delete process.env.HOUSE_PLAN_GOLDEN;
    else process.env.HOUSE_PLAN_GOLDEN = beforeG;
    if (beforeE == null) delete process.env.HOUSE_PLAN_EVEN;
    else process.env.HOUSE_PLAN_EVEN = beforeE;
  });

  function wholeGemini(answer: Buffer) {
    const configs: Array<Record<string, unknown> | undefined> = [];
    const client = {
      models: {
        generateContent: jest.fn(async (req: { config?: { imageConfig?: Record<string, unknown> } }) => {
          configs.push(req.config?.imageConfig);
          return {
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: answer.toString("base64") } }] } }],
            usageMetadata: { promptTokenCount: 1900, candidatesTokenCount: 3780, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 3780 }] },
          };
        }),
      },
    };
    return { client: client as unknown as GoogleGenAI, configs };
  }

  it("asks the model for 4K and keeps the painting at its own size", async () => {
    const render = await jpeg(house());
    const painting = await sharp(Buffer.from(textured(house())), { raw: { width: W, height: H, channels: 3 } }).resize(W * 2, H * 2).jpeg({ quality: 92 }).toBuffer();
    const mask = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const gemini = wholeGemini(painting);
    const pics = store({ "view-planwhole-floor-1.jpg": render, "mask-floor-1.png": mask });
    const spend = houseSpend({ budgetIls: null });
    expect(await paintHousePictures(pics.api, { subject: "a house", style, client: gemini.client, spend, models: [NB], humanReview: true, concurrency: 1 })).toEqual(["view-planwhole-floor-1.jpg"]);
    expect(gemini.configs).toEqual([{ imageSize: "4K", aspectRatio: "3:2" }]);
    expect((await sharp(pics.pics.get("view-planwhole-floor-1.jpg")!).metadata()).width).toBe(W * 2);
    expect(spend.pictures).toMatchObject([{ name: "view-planwhole-floor-1.jpg", outcome: "painted", calls: 1 }]);
  });

  it("makes no call where the ceiling holds a 1K picture but not a 4K one", async () => {
    const gemini = wholeGemini(await jpeg(house()));
    const spend = houseSpend({ budgetIls: attemptEstimateUsd(NB, 1, new Date(), "1K") * HOUSE_USD_TO_ILS_ESTIMATE * 1.2 });
    const pics = store({ "view-planwhole-floor-0.jpg": await jpeg(house()) });
    expect(await paintHousePictures(pics.api, { subject: "a house", style, client: gemini.client, spend, models: [NB], humanReview: true, concurrency: 1 })).toEqual([]);
    expect(gemini.configs).toHaveLength(0);
    expect(spend.pictures).toMatchObject([{ outcome: "budget", calls: 0 }]);
  });

  it("sends a storey's swatches after its plan, says where they start, and holds them against the ceiling", async () => {
    const swatch = await jpeg(house());
    const sent: Array<{ texts: string[]; images: number }> = [];
    const answer = await jpeg(textured(house()));
    const client = {
      models: {
        generateContent: jest.fn(async (req: { contents: Array<{ parts: Array<{ text?: string; inlineData?: unknown }> }> }) => {
          const parts = req.contents[0]!.parts;
          sent.push({ texts: parts.flatMap((p) => (p.text ? [p.text] : [])), images: parts.filter((p) => p.inlineData).length });
          return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: answer.toString("base64") } }] } }], usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 3780 } };
        }),
      },
    } as unknown as GoogleGenAI;
    const references = (name: string) => (name === "view-planwhole-floor-1.jpg" ? { images: [swatch, swatch, swatch], prompt: (first: number, plan: number) => `SWATCHES ${first}-${first + 2} OF ${plan}` } : undefined);
    const pics = store({ "view-planwhole-floor-1.jpg": await jpeg(house()) });
    await paintHousePictures(pics.api, { subject: "a house", style, client, spend: houseSpend({ budgetIls: null }), models: [NB], humanReview: true, concurrency: 1, references });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.images).toBe(4);
    expect(sent[0]!.texts.join("\n")).toMatch(/SWATCHES 2-4 OF 1$/);

    // A ceiling that holds the plan alone at 4K but not with its three swatches: no call.
    const now = new Date();
    const [alone, withRefs] = [attemptEstimateUsd(NB, 1, now, "4K"), attemptEstimateUsd(NB, 4, now, "4K")].map((u) => u * HOUSE_USD_TO_ILS_ESTIMATE);
    expect(withRefs).toBeGreaterThan(alone!);
    const spend = houseSpend({ budgetIls: (alone! + withRefs!) / 2 });
    sent.length = 0;
    expect(await paintHousePictures(store({ "view-planwhole-floor-1.jpg": await jpeg(house()) }).api, { subject: "a house", style, client, spend, models: [NB], humanReview: true, concurrency: 1, references })).toEqual([]);
    expect(sent).toHaveLength(0);
    expect(estimateHousePainting({ pictures: 1, model: NB, attempts: 1, size: "4K", references: 3 }).perPictureIls).toBeCloseTo(withRefs!, 6);
  });
});
