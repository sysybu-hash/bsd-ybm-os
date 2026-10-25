import { readFile } from "fs/promises";
import path from "path";

import type { HTTPRequest } from "puppeteer-core";
import sharp from "sharp";

import { env } from "@/lib/env";
import { launchChromium } from "@/lib/pdf/chromium-launch";
import { forTracing } from "@/lib/projects/building/cut-model";
import { BUILDING_ORIGIN, buildingPageHtml, type BuildingRenderPayload } from "@/lib/projects/building/render-page";

/**
 * The geometric render is local Chrome plus three.js. Path tracing needs the
 * machine's GPU and a long DevTools timeout; on the website (Vercel) it is
 * dropped and the same frame is rasterised. Local FLUX and paid paint are
 * not this function.
 */
function framesForHost(payloads: BuildingRenderPayload[]): BuildingRenderPayload[] {
  if (!env.VERCEL) return payloads;
  return payloads.map((p) => (p.pathTrace ? { ...p, pathTrace: undefined } : p));
}

/**
 * Draw frames of a building in a headless Chromium, one browser for all of
 * them. three and its add-ons are answered from node_modules, as the flat
 * renderer answers three: nothing is fetched from the network.
 */
export async function renderBuildingFrames(
  payloads: BuildingRenderPayload[],
  options?: { outputWidthPx?: number; timeoutMs?: number },
): Promise<Buffer[]> {
  payloads = framesForHost(payloads);
  // A traced frame leaves the GPU process holding its scene's textures, and
  // the next traced frame in the same browser came out with its walls
  // missing. Each traced frame gets a browser of its own.
  if (payloads.length > 1 && payloads.some((p) => p.pathTrace)) {
    const out: Buffer[] = [];
    let batch: BuildingRenderPayload[] = [];
    const flush = async () => {
      if (batch.length) out.push(...(await renderBuildingFrames(batch, options)));
      batch = [];
    };
    for (const p of payloads) {
      if (p.pathTrace) {
        await flush();
        out.push(...(await renderBuildingFrames([p], options)));
      } else batch.push(p);
    }
    await flush();
    return out;
  }
  const frameMs = options?.timeoutMs ?? 60_000;
  const traced = payloads.some((p) => p.pathTrace);
  // A stuck DevTools call otherwise waits the 180s default, and two frames
  // of that are what the platform kills at 300s.
  const browser = await launchChromium({
    webgl: true,
    viewport: { width: 900, height: 700 },
    protocolTimeout: traced ? 1_800_000 : frameMs + 20_000,
  });
  const cache = new Map<string, string>();
  const source = async (file: string) => {
    const hit = cache.get(file);
    if (hit) return hit;
    const text = await readFile(file, "utf8");
    cache.set(file, text);
    return text;
  };
  const three = path.join(process.cwd(), "node_modules", "three");
  // The path tracer and its BVH, for a frame that asks for one: local only.
  const tracer = path.join(process.cwd(), "node_modules", "three-gpu-pathtracer", "build");
  const bvh = path.join(process.cwd(), "node_modules", "three-mesh-bvh", "build");
  const out: Buffer[] = [];
  try {
    for (const payload of payloads) {
      const page = await browser.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") process.stderr.write(`[page] ${m.text()}\n`);
      });
      await page.setRequestInterception(true);
      const html = buildingPageHtml(forTracing(payload));
      page.on("request", (req: HTTPRequest) => {
        const url = req.url();
        if (!url.startsWith(BUILDING_ORIGIN)) return void req.abort();
        const name = url.slice(BUILDING_ORIGIN.length + 1);
        if (name === "" || name === "index.html") {
          return void req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
        }
        const file = name.startsWith("three/")
          ? path.join(three, "build", name.slice("three/".length))
          : name.startsWith("jsm/")
            ? path.join(three, "examples", "jsm", name.slice("jsm/".length))
            : name.startsWith("ptr/")
              ? path.join(tracer, name.slice("ptr/".length))
              : name.startsWith("bvh/")
                ? path.join(bvh, name.slice("bvh/".length))
                : null;
        if (!file || !(file.startsWith(three) || file.startsWith(tracer) || file.startsWith(bvh))) {
          process.stderr.write(`[page] not served: ${name}
`);
          return void req.respond({ status: 404, body: "" });
        }
        void source(file).then(
          (body) => req.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body }),
          () => {
            process.stderr.write(`[page] missing ${file}\n`);
            return req.respond({ status: 404, body: "" });
          },
        );
      });
      try {
        await page.goto(`${BUILDING_ORIGIN}/index.html`, { waitUntil: "load", timeout: Math.min(25_000, frameMs) });
        await page.waitForFunction("window.__renderDone === true || window.__renderError", {
          timeout: payload.pathTrace ? 1_500_000 : frameMs,
        });
        const failure = (await page.evaluate("window.__renderError || null")) as string | null;
        if (failure) throw new Error(failure);
        const canvas = await page.$("canvas");
        if (!canvas) throw new Error("no canvas");
        const shot = Buffer.from(await canvas.screenshot({ type: "jpeg", quality: 92 }));
        out.push(
          await sharp(shot)
            .resize({ width: options?.outputWidthPx ?? Math.round(payload.width / 2), withoutEnlargement: true })
            .jpeg({ quality: 93, chromaSubsampling: "4:4:4" })
            .toBuffer(),
        );
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return out;
}
