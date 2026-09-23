import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import { launchChromium } from "@/lib/pdf/chromium-launch";
import { openScenePage } from "@/lib/projects/scene3d/chromium-page";
import { degrade, QUALITY, type QualityProfile } from "@/lib/projects/scene3d/quality";
import { buildRenderPayload } from "@/lib/projects/scene3d/render-payload";
import { renderPageHtml } from "@/lib/projects/scene3d/render-page";
import type { SceneStyle } from "@/lib/projects/scene3d/style";
import type { ViewSpec } from "@/lib/projects/scene3d/cameras";
import type { FlatScene } from "@/lib/projects/scene3d/types";

/**
 * The seam every renderer sits behind.
 *
 * A request is a scene, a style, a view and a quality profile; a result is an
 * image. What draws it — a headless Chromium here, the user's own GPU in the
 * app, a path tracer on a rented card later — is not the caller's business,
 * and swapping one for another is a line of configuration rather than a
 * rewrite. That is the whole reason the scene model exists.
 */

const log = createLogger("scene3d-renderer");

export type SceneRenderRequest = {
  scene: FlatScene;
  style: SceneStyle;
  view: ViewSpec;
  quality?: QualityProfile;
  /** Epoch ms after which no further attempt may start. */
  deadlineMs?: number;
};

export type SceneRenderResult = {
  mimeType: string;
  base64: string;
  widthPx: number;
  heightPx: number;
  /** What it actually drew with, after any degradation. */
  quality: QualityProfile["id"];
  ms: number;
};

export type FlatSceneRenderer = (req: SceneRenderRequest) => Promise<SceneRenderResult | null>;

/** Milliseconds one frame is given, including the browser's first launch. */
const FRAME_MS = 90_000;

function timeLeft(deadlineMs: number | undefined, needMs: number): boolean {
  if (!deadlineMs) return true;
  return Date.now() + needMs <= deadlineMs;
}

/**
 * Draw the frame in a headless Chromium.
 *
 * Measured on the platform: a 4000 by 3000 frame with a 2048 shadow map draws
 * in about 200 ms, and the request's whole cost is reading it back — a PNG of
 * that size took nineteen seconds in the function, a JPEG a fraction of it. So
 * the frame comes back as JPEG and sharp does the downsample, which is also
 * the supersampling: deterministic, and free next to the draw.
 */
export const chromiumSceneRenderer: FlatSceneRenderer = async (req) => {
  const started = Date.now();
  let quality = req.quality ?? QUALITY.booklet;
  const browser = await launchChromium({ webgl: true, viewport: { width: 900, height: 700 } });
  try {
    for (;;) {
      if (!timeLeft(req.deadlineMs, FRAME_MS)) {
        log.warn("out of time for a render", { view: req.view.id });
        return null;
      }
      const payload = buildRenderPayload(req.scene, req.style, req.view, quality);
      const page = await openScenePage(browser, renderPageHtml(payload));
      try {
        await page.waitForFunction("window.__renderDone === true || window.__renderError", {
          timeout: Math.min(FRAME_MS, 120_000),
        });
        const failure = (await page.evaluate("window.__renderError || null")) as string | null;
        if (failure) throw new Error(failure);

        const canvas = await page.$("canvas");
        if (!canvas) throw new Error("הדף לא צייר קנבס");
        const shot = Buffer.from(await canvas.screenshot({ type: "jpeg", quality: 94 }));

        const outWidth = quality.outputWidthPx;
        const out = await sharp(shot)
          .resize({ width: outWidth, withoutEnlargement: true })
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toBuffer();
        const meta = await sharp(out).metadata();
        return {
          mimeType: "image/jpeg",
          base64: out.toString("base64"),
          widthPx: meta.width ?? outWidth,
          heightPx: meta.height ?? 0,
          quality: quality.id,
          ms: Date.now() - started,
        };
      } catch (err: unknown) {
        // A frame that did not come back is a reason to draw a cheaper one,
        // not a reason to fail the run: the caller still has the SVG plate.
        const next = degrade(quality);
        log.warn("render attempt failed", {
          view: req.view.id,
          quality: quality.id,
          width: quality.renderWidthPx,
          error: err instanceof Error ? err.message : String(err),
          retrying: next != null,
        });
        if (!next) return null;
        quality = next;
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
};
