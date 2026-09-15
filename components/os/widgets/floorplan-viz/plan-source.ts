"use client";

import type { FloorplanBbox } from "@/lib/projects/floorplan-layout";
import type { LocatorFocus } from "@/lib/projects/floorplan-locator";

const PDF_SCALE = 3;

export function fileFromDataUrl(dataUrl: string, fileName: string): File {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("invalid data url");
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  const mime = match[1] || "image/jpeg";
  const isPdf =
    mime === "application/pdf" ||
    (bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46);
  const ext = isPdf ? "pdf" : mime.includes("png") ? "png" : "jpg";
  const base = (fileName.trim() || `plan.${ext}`).replace(/\.[^.]+$/u, "") || "plan";
  return new File([bytes], `${base}.${ext}`, { type: isPdf ? "application/pdf" : mime });
}

/** רינדור עמוד ראשון של PDF / תמונת תוכנית ל-data URL */
export async function rasterizePlanFile(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: PDF_SCALE });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(url);
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("plan image decode failed"));
    };
    img.src = url;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("locator source failed"));
    img.src = src;
  });
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  highlight: FloorplanBbox | null,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  ctx.drawImage(img, ox, oy, dw, dh);
  ctx.fillStyle = "rgba(15,23,42,0.48)";
  ctx.fillRect(ox, oy, dw, dh);
  if (!highlight) return;
  const hx = ox + highlight.x * dw;
  const hy = oy + highlight.y * dh;
  const hw = highlight.w * dw;
  const hh = highlight.h * dh;
  ctx.save();
  ctx.beginPath();
  ctx.rect(hx, hy, hw, hh);
  ctx.clip();
  ctx.drawImage(img, ox, oy, dw, dh);
  ctx.restore();
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = Math.max(2, Math.min(dw, dh) * 0.012);
  ctx.strokeRect(hx, hy, hw, hh);
}

function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  crop: FloorplanBbox,
  w: number,
  h: number,
) {
  const sx = crop.x * img.naturalWidth;
  const sy = crop.y * img.naturalHeight;
  const sw = Math.max(1, crop.w * img.naturalWidth);
  const sh = Math.max(1, crop.h * img.naturalHeight);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, ox, oy, dw, dh);
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + 1.5, oy + 1.5, dw - 3, dh - 3);
}

/** פס אחד: קטע מקורי + מפת מיקום — לייצוא PDF */
export async function composeLocatorStripJpeg(planSrc: string, focus: LocatorFocus): Promise<Blob> {
  const img = await loadImage(planSrc);
  const canvas = document.createElement("canvas");
  canvas.width = 1100;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.fillStyle = "#e7e5e4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gap = 10;
  const cropW = Math.round(canvas.width * 0.62) - gap;
  drawCrop(ctx, img, focus.crop, cropW, canvas.height);
  ctx.save();
  ctx.translate(cropW + gap, 0);
  drawMinimap(ctx, img, focus.highlight, canvas.width - cropW - gap, canvas.height);
  ctx.restore();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("locator jpeg failed");
  return blob;
}
