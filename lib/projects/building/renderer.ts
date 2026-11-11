import { readFile } from "fs/promises";
import { createRequire } from "module";
import path from "path";

import type { HTTPRequest } from "puppeteer-core";
import sharp from "sharp";

import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { noteDrop } from "@/lib/projects/drop-log";
import { launchChromium } from "@/lib/pdf/chromium-launch";
import { forTracing } from "@/lib/projects/building/cut-model";
import { BUILDING_ORIGIN, buildingPageHtml, type BuildingRenderPayload } from "@/lib/projects/building/render-page";

const log = createLogger("building-renderer");

/**
 * A package's folder found the way Node finds it, from the working directory up: a git worktree has no
 * node_modules of its own and walks up to the main checkout's (2026-10-26: every Wolf frame timed out there).
 * `up` climbs from the resolved entry file (three: build/three.cjs → 2). Falls back to cwd/node_modules/<rel>.
 */
function packageDir(name: string, up: number, rel: string): string {
  try {
    let dir = createRequire(path.join(process.cwd(), "noop.js")).resolve(name);
    for (let i = 0; i < up; i++) dir = path.dirname(dir);
    return dir;
  } catch {
    return path.join(process.cwd(), "node_modules", rel);
  }
}

/** A primitive with a non-finite number in it: a raster box just vanishes, but in the tracer's BVH it can scramble the whole frame. */
function hasNonFinite(value: unknown, depth = 0): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (depth > 4 || value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    for (const v of value) if (hasNonFinite(v, depth + 1)) return true;
    return false;
  }
  for (const v of Object.values(value)) if (hasNonFinite(v, depth + 1)) return true;
  return false;
}

/** The payload without primitives the page cannot draw, each one counted (drop-log) — never silently. */
function withFinitePrimitives(payload: BuildingRenderPayload): BuildingRenderPayload {
  const prims = payload.model.primitives;
  const bad = new Set(prims.filter((p) => hasNonFinite(p)));
  if (!bad.size) return payload;
  for (const p of bad) noteDrop("renderer:non-finite-primitive", () => `${p.type} ${"tag" in p ? String(p.tag ?? "") : ""}`);
  return { ...payload, model: { ...payload.model, primitives: prims.filter((p) => !bad.has(p)) } };
}

/** Below this mass agreement with the raster frame of the same camera a traced frame is spoiled (dwf-booklet's measured rule, now for every caller). */
const TRACE_MIN_MASS_MATCH = 0.6;

/**
 * One traced frame, checked. A tracer that ran out of GPU drew floors without walls (Pisga's north facade, a
 * scrambled classroom, white frames at 2048 samples) and nothing caught it but an eye. The plain raster frame of the
 * same (cut) camera is drawn too — seconds — and kept whenever the traced one fails, is blank, or loses its masses.
 */
async function verifiedTracedFrame(
  payload: BuildingRenderPayload,
  options: { outputWidthPx?: number; timeoutMs?: number } | undefined,
): Promise<Buffer> {
  const plainPayload: BuildingRenderPayload = { ...forTracing(payload), pathTrace: undefined };
  const plainOf = async () =>
    (await renderBuildingFrames([plainPayload], { ...options, verifyTrace: false, timeoutMs: Math.max(options?.timeoutMs ?? 60_000, 300_000) }))[0]!;
  let traced: Buffer;
  try {
    traced = (await renderBuildingFrames([payload], { ...options, verifyTrace: false }))[0]!;
  } catch (err: unknown) {
    log.warn("traced frame failed; raster kept", { error: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
    noteDrop("renderer:traced-frame-failed", () => (err instanceof Error ? err.message : String(err)).slice(0, 120));
    return plainOf();
  }
  const plain = await plainOf();
  const stats = await sharp(traced).stats();
  const flat = stats.channels.slice(0, 3).every((c) => c.stdev < 2);
  const { massMatch } = await import("@/lib/projects/building/finish");
  const mass = flat ? 0 : await massMatch(plain, traced);
  if (flat || mass < TRACE_MIN_MASS_MATCH) {
    log.warn("traced frame spoiled; raster kept", { flat, mass: Number(mass.toFixed(2)), samples: payload.pathTrace?.samples });
    noteDrop("renderer:traced-frame-spoiled", `${flat ? "blank" : `mass ${mass.toFixed(2)}`}, ${payload.width}px, ${payload.pathTrace?.samples} samples`);
    return plain;
  }
  return traced;
}

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
  options?: {
    outputWidthPx?: number;
    timeoutMs?: number;
    /** Check each traced frame against the plain raster frame of the same camera and keep the plain one when the traced is spoiled (default on). */
    verifyTrace?: boolean;
  },
): Promise<Buffer[]> {
  payloads = framesForHost(payloads);
  if (payloads.length === 1 && payloads[0]!.pathTrace && options?.verifyTrace !== false) {
    return [await verifiedTracedFrame(payloads[0]!, options)];
  }
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
  const three = packageDir("three", 2, "three");
  // The path tracer and its BVH, for a frame that asks for one: local only.
  const tracer = packageDir("three-gpu-pathtracer", 1, "three-gpu-pathtracer/build");
  const bvh = packageDir("three-mesh-bvh", 1, "three-mesh-bvh/build");
  const out: Buffer[] = [];
  try {
    for (const [index, payload] of payloads.entries()) {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error" || /favicon|Failed to load resource/.test(m.text())) return;
        pageErrors.push(m.text().slice(0, 200));
        process.stderr.write(`[page] ${m.text()}\n`);
      });
      await page.setRequestInterception(true);
      const html = buildingPageHtml(forTracing(withFinitePrimitives(payload)));
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
            // A missing module used to leave the frame waiting its whole timeout (60 s; 25 min traced) — the worktree "time out".
            process.stderr.write(`[page] missing ${file}\n`);
            pageErrors.push(`missing ${file}`);
            return req.respond({ status: 404, body: "" });
          },
        );
      });
      const frameName = `frame ${index + 1}/${payloads.length} (${payload.width}×${payload.height}${payload.pathTrace ? `, traced ${payload.pathTrace.samples}` : ""})`;
      try {
        // The page draws as it loads: on the website's software GL (no GPU)
        // a room took past 25 s to load where this machine's GPU takes 3.
        await page.goto(`${BUILDING_ORIGIN}/index.html`, { waitUntil: "load", timeout: frameMs });
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${frameName}: ${msg}${pageErrors.length ? `; page: ${pageErrors.slice(0, 5).join(" | ")}` : ""}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return out;
}
