import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-raster-page");

/**
 * The whole sales-sheet page as a JPEG — vectors, hatches and title block.
 * extractPdfPageRaster only lifts an embedded photo; a CAD export has none,
 * and the wall-only diagram is not the sheet a buyer compares against.
 */
export async function rasterizePdfPageJpeg(
  pdf: Buffer | Uint8Array,
  width = 1400,
): Promise<string | null> {
  let createCanvas: typeof import("@napi-rs/canvas").createCanvas;
  try {
    ({ createCanvas } = await import("@napi-rs/canvas"));
  } catch (err: unknown) {
    log.error("@napi-rs/canvas did not load; the booklet has no sheet page", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (err: unknown) {
    log.error("pdfjs did not load; the booklet has no sheet page", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  class NodeCanvasFactory {
    create(w: number, h: number) {
      const canvas = createCanvas(Math.ceil(w), Math.ceil(h));
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(canvasAndContext: { canvas: { width: number; height: number } }, w: number, h: number) {
      canvasAndContext.canvas.width = Math.ceil(w);
      canvasAndContext.canvas.height = Math.ceil(h);
    }
    destroy(canvasAndContext: { canvas: { width: number; height: number } }) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
  }

  const factory = new NodeCanvasFactory();
  try {
    // pdfjs 4 takes the factory as a class and builds its own instances for
    // the scratch canvases a render needs.
    const doc = await pdfjs.getDocument({
      data: Uint8Array.from(pdf),
      isEvalSupported: false,
      useSystemFonts: true,
      CanvasFactory: NodeCanvasFactory,
    }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const { canvas, context } = factory.create(viewport.width, viewport.height);
    await page.render({
      // Skia's context implements the 2D API pdfjs draws with, but not the
      // DOM-only members (drawFocusIfNeeded) the DOM type insists on.
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return (await canvas.encode("jpeg", 90)).toString("base64");
  } catch (err: unknown) {
    log.warn("page raster failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
