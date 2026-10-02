import { readFile } from "fs/promises";
import path from "path";

import type { HTTPRequest } from "puppeteer-core";
import sharp from "sharp";

import { launchChromium } from "@/lib/pdf/chromium-launch";
import { BUILDING_ORIGIN, buildingPageHtml, type BuildingRenderPayload } from "@/lib/projects/building/render-page";

/**
 * Draw frames of a building in a headless Chromium, one browser for all of
 * them. three and its add-ons are answered from node_modules, as the flat
 * renderer answers three: nothing is fetched from the network.
 */
export async function renderBuildingFrames(
  payloads: BuildingRenderPayload[],
  options?: { outputWidthPx?: number; timeoutMs?: number },
): Promise<Buffer[]> {
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
  const browser = await launchChromium({ webgl: true, viewport: { width: 900, height: 700 } });
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
      const html = buildingPageHtml(payload);
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
          () => req.respond({ status: 404, body: "" }),
        );
      });
      try {
        await page.goto(`${BUILDING_ORIGIN}/index.html`, { waitUntil: "load", timeout: 180_000 });
        await page.waitForFunction("window.__renderDone === true || window.__renderError", {
          timeout: options?.timeoutMs ?? 240_000,
        });
        const failure = (await page.evaluate("window.__renderError || null")) as string | null;
        if (failure) throw new Error(failure);
        const canvas = await page.$("canvas");
        if (!canvas) throw new Error("no canvas");
        const shot = Buffer.from(await canvas.screenshot({ type: "png" }));
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
