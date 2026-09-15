"use client";

import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";

/**
 * Packing stills for the booklet request.
 *
 * The export posts one multipart body, and a full-resolution still is several
 * megabytes of base64 — these redraw it through a canvas at print size first.
 */
export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "image/png" });
}

export function compressUrlForPdf(url: string, fill = "#ffffff"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const max = 1800;
      const scale = Math.min(1, max / Math.max(image.width, image.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d unavailable"));
        return;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((out) => resolve(out ?? new Blob()), "image/jpeg", 0.82);
    };
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = url;
  });
}

export function compressForPdf(img: FloorplanVizImage): Promise<{ blob: Blob }> {
  const mime = img.mimeType || "image/jpeg";
  if (!img.base64 && img.src) {
    return fetch(img.src, { credentials: "include" }).then(async (res) => {
      const blob = await res.blob();
      return { blob };
    });
  }
  const base64 = img.base64;
  if (!base64) return Promise.resolve({ blob: new Blob() });
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(image.width, image.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ blob: base64ToBlob(base64, mime) });
        return;
      }
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((out) => resolve({ blob: out ?? base64ToBlob(base64, mime) }), "image/jpeg", 0.84);
    };
    image.onerror = () => resolve({ blob: base64ToBlob(base64, mime) });
    image.src = `data:${mime};base64,${base64}`;
  });
}
