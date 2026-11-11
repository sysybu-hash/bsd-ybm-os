/**
 * Project files: which ones VMB takes, how they are named in storage, and the
 * limits. Pure and client-safe, so the browser refuses what the server would.
 */

export type VmbFileKind = "dxf" | "dwg" | "pdf" | "dwf" | "image";

const BY_EXT: Record<string, { kind: VmbFileKind; type: string }> = {
  dxf: { kind: "dxf", type: "image/vnd.dxf" },
  dwg: { kind: "dwg", type: "image/vnd.dwg" },
  pdf: { kind: "pdf", type: "application/pdf" },
  dwf: { kind: "dwf", type: "model/vnd.dwf" },
  dwfx: { kind: "dwf", type: "model/vnd.dwfx+xps" },
  jpg: { kind: "image", type: "image/jpeg" },
  jpeg: { kind: "image", type: "image/jpeg" },
  png: { kind: "image", type: "image/png" },
  webp: { kind: "image", type: "image/webp" },
  heic: { kind: "image", type: "image/heic" },
  tif: { kind: "image", type: "image/tiff" },
  tiff: { kind: "image", type: "image/tiff" },
};

/** Every content type an upload token may carry: exactly the ones named above. */
export const VMB_UPLOAD_CONTENT_TYPES = [...new Set(Object.values(BY_EXT).map((v) => v.type))];

/** One file: big DWG/PDF sets run to hundreds of MB, so the cap is generous. */
export const VMB_FILE_MAX_BYTES = 500 * 1024 * 1024;
/** A whole project. */
export const VMB_PROJECT_MAX_BYTES = 4 * 1024 * 1024 * 1024;
export const VMB_PROJECT_MAX_FILES = 400;

export function extensionOf(name: string): string {
  const base = name.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The file's kind, or null when VMB does not read it (it is then not uploaded at all). */
export function fileKind(name: string): VmbFileKind | null {
  return BY_EXT[extensionOf(name)]?.kind ?? null;
}

/** Content type by extension: browsers report DXF/DWG as "" or octet-stream. */
export function contentTypeFor(name: string): string | null {
  return BY_EXT[extensionOf(name)]?.type ?? null;
}

/**
 * The path inside the dropped folder, made safe to store: forward slashes,
 * no "." or ".." segments, no leading slash, no control characters, bounded.
 * Hebrew names are kept as they are. Null when nothing usable is left.
 */
export function safeRelPath(raw: string): string | null {
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.replace(/[\u0000-\u001f\u007f]/g, "").trim())
    .filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) return null;
  const joined = parts.join("/");
  return joined.length > 300 ? null : joined;
}

/** Storage prefix for one project; the upload route allows no other. */
export function projectBlobPrefix(projectId: string): string {
  return `vmb/${projectId}/`;
}

export function blobPathnameFor(projectId: string, relPath: string): string {
  return `${projectBlobPrefix(projectId)}${relPath}`;
}

/**
 * What is wrong with adding these files to a project that already holds
 * `existing` files of `existingBytes`, or null when they fit.
 */
export function capacityProblem(
  incoming: { size: number }[],
  existing: number,
  existingBytes: number,
): "too_many_files" | "project_too_large" | "file_too_large" | null {
  if (incoming.some((f) => f.size > VMB_FILE_MAX_BYTES)) return "file_too_large";
  if (existing + incoming.length > VMB_PROJECT_MAX_FILES) return "too_many_files";
  const add = incoming.reduce((a, f) => a + f.size, 0);
  if (existingBytes + add > VMB_PROJECT_MAX_BYTES) return "project_too_large";
  return null;
}
