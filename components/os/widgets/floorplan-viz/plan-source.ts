"use client";

import type { FloorplanBbox } from "@/lib/projects/floorplan-layout";
import type { LocatorFocus } from "@/lib/projects/floorplan-locator";
import { PLAN_UPLOAD_MAX_BYTES, PLAN_UPLOAD_PART_BYTES } from "@/lib/projects/plan-upload-limits";

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

/** Over this, a request body is refused by the platform before the route runs. */
export const PLAN_DIRECT_UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;

/** A drawing staged for the run: Blob when it is configured, otherwise parts. */
export type StagedPlanRef = { blobUrl?: string; uploadId?: string };

function contentTypeForUpload(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".dxf")) return "image/vnd.dxf";
  if (name.endsWith(".dwg")) return "image/vnd.dwg";
  if (name.endsWith(".dwf") || name.endsWith(".w2d")) return "model/vnd.dwf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return "application/octet-stream";
}

let blobConfiguredOnce: Promise<boolean> | null = null;

/** Asked once per page: a deployment without Blob refuses every token. */
function blobConfigured(): Promise<boolean> {
  blobConfiguredOnce ??= fetch("/api/projects/visualize-floorplan/upload", { credentials: "include" })
    .then(async (res) => {
      const json = (await res.json().catch(() => null)) as { blob?: unknown } | null;
      return res.ok && json?.blob === true;
    })
    // Unknown is not "no": the token request still answers for itself.
    .catch(() => true);
  return blobConfiguredOnce;
}

/**
 * Upload a plan straight to Blob and answer with its URL.
 *
 * Returns null for a file small enough to post in the request itself, and for
 * any failure — the caller then falls back to multipart, which still works for
 * anything under the platform's limit.
 */
export async function uploadPlanToBlob(file: File, options?: { always?: boolean }): Promise<string | null> {
  // A permit strip is read twice — once for its apartments, once for the run —
  // so it goes to Blob whatever its size.
  if (!options?.always && file.size <= PLAN_DIRECT_UPLOAD_MAX_BYTES) return null;
  if (!(await blobConfigured())) return null;
  try {
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/projects/visualize-floorplan/upload",
      contentType: contentTypeForUpload(file),
    });
    return blob.url;
  } catch {
    // Blob may not be configured for this deployment; the caller decides.
    return null;
  }
}

export function planExceedsUploadLimit(file: File): boolean {
  return file.size > PLAN_UPLOAD_MAX_BYTES;
}

async function uploadPlanInParts(file: File): Promise<string | null> {
  const totalParts = Math.ceil(file.size / PLAN_UPLOAD_PART_BYTES);
  const opened = await fetch("/api/projects/visualize-floorplan/upload-part", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      op: "begin",
      fileName: file.name,
      totalBytes: file.size,
      totalParts,
    }),
  });
  const openedJson = (await opened.json().catch(() => null)) as { uploadId?: string } | null;
  const uploadId = opened.ok ? openedJson?.uploadId : undefined;
  if (!uploadId) return null;
  const concurrency = Math.min(4, totalParts);
  let next = 0;
  let failed = false;
  async function sendPart() {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= totalParts) return;
      const slice = file.slice(index * PLAN_UPLOAD_PART_BYTES, (index + 1) * PLAN_UPLOAD_PART_BYTES);
      const form = new FormData();
      form.append("uploadId", uploadId!);
      form.append("index", String(index));
      form.append("file", slice, file.name);
      const part = await fetch("/api/projects/visualize-floorplan/upload-part", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!part.ok) failed = true;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => sendPart()));
  if (failed) return null;
  const finished = await fetch("/api/projects/visualize-floorplan/upload-part", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "finish", uploadId }),
  });
  return finished.ok ? uploadId : null;
}

/**
 * Put a plan where the run can read it.
 *
 * Small files stay in the request. Larger ones go to Blob, and when Blob is
 * not configured they go up in parts through the API instead.
 */
export async function stagePlanFile(
  file: File,
  options?: { always?: boolean },
): Promise<StagedPlanRef | null> {
  if (!options?.always && file.size <= PLAN_DIRECT_UPLOAD_MAX_BYTES) return null;
  const blobUrl = await uploadPlanToBlob(file, options);
  if (blobUrl) return { blobUrl };
  const uploadId = await uploadPlanInParts(file);
  return uploadId ? { uploadId } : null;
}
