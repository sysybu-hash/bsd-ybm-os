import type { NextRequest } from "next/server";

import { withCronGuard } from "@/lib/cron-guard";
import { createLogger } from "@/lib/logger";
import { launchChromium } from "@/lib/pdf/chromium-launch";
import { openScenePage } from "@/lib/projects/scene3d/chromium-page";
import { spikeHtml } from "@/lib/projects/scene3d/spike-page";

/**
 * P0 spike — temporary, and deleted once it has answered its question.
 *
 * The whole server-side half of the deterministic renderer rests on one
 * assumption: that a Vercel function can get a WebGL context out of
 * @sparticuz/chromium's SwiftShader, and draw a sales-still-sized frame inside
 * the time budget. This route answers that on the platform itself, before a
 * line of scene code is written. It is guarded by the cron secret because it
 * has to be callable with curl and must not be callable by anyone else.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("render3d-spike");

function intParam(req: NextRequest, name: string, fallback: number, max: number): number {
  const raw = Number(req.nextUrl.searchParams.get(name));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.round(raw), max);
}

export async function GET(req: NextRequest) {
  return withCronGuard(req, "render3d-spike", { type: "interval", value: 1, unit: "day" }, async () => {
    const width = intParam(req, "w", 4000, 6000);
    const height = intParam(req, "h", Math.round((width * 3) / 4), 6000);
    const boxes = intParam(req, "boxes", 300, 3000);
    const shadows = req.nextUrl.searchParams.get("shadows") !== "0";

    const started = Date.now();
    const browser = await launchChromium({ webgl: true, viewport: { width: 800, height: 600 } });
    const launchedMs = Date.now() - started;
    try {
      const pageStarted = Date.now();
      const page = await openScenePage(browser, spikeHtml({ width, height, shadows, boxes }));
      await page.waitForFunction("window.__spike !== undefined", { timeout: 240_000 });
      const report = (await page.evaluate("window.__spike")) as Record<string, unknown>;
      const renderedMs = Date.now() - pageStarted;

      // Reading the frame back is the whole cost at this size: a 12 Mpx PNG
      // took 19 seconds in the function while the draw took 0.2. The renderer
      // downsamples with sharp anyway, so the question is which encoder the
      // browser should hand us.
      const format = req.nextUrl.searchParams.get("fmt") === "png" ? "png" : "jpeg";
      let imageBytes = 0;
      let shotMs = 0;
      if (report?.ok === true) {
        const shotStarted = Date.now();
        const canvas = await page.$("canvas");
        const shot = canvas
          ? await canvas.screenshot(
              format === "png" ? { type: "png" } : { type: "jpeg", quality: 92 },
            )
          : null;
        shotMs = Date.now() - shotStarted;
        imageBytes = shot ? Buffer.from(shot).length : 0;
      }

      const result = { width, height, boxes, shadows, format, launchedMs, renderedMs, shotMs, imageBytes, ...report };
      log.info("webgl spike", result);
      return result;
    } finally {
      await browser.close();
    }
  });
}
