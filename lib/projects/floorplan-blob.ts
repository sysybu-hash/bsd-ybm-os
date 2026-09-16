import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-blob");

/**
 * A sales sheet the browser uploaded straight to Blob.
 *
 * Vercel rejects a request body over ~4.5MB before the route runs, and a real
 * sales sheet is often larger, so the bytes never travel through the API at
 * all — the browser uploads them and hands the route a URL.
 */
export const FLOORPLAN_BLOB_MAX_BYTES = 25 * 1024 * 1024;

/** Only this project's Blob store. Anything else is a URL a caller chose for us. */
export function isFloorplanBlobUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return /(^|\.)public\.blob\.vercel-storage\.com$/i.test(url.hostname);
}

/** The uploaded file's own name, for the run title and the booklet caption. */
export function floorplanBlobFileName(raw: string): string | undefined {
  try {
    const name = decodeURIComponent(new URL(raw).pathname.split("/").pop() ?? "");
    return name.trim() || undefined;
  } catch {
    return undefined;
  }
}

export type FetchedFloorplanBlob = {
  base64: string;
  mimeType: string;
  fileName?: string;
  bytes: number;
};

/**
 * Read an uploaded plan back into the route.
 *
 * Refuses anything that is not this project's Blob host: the URL arrives in a
 * request body, and fetching whatever it points at would make this route a
 * proxy into the platform's own network.
 */
export async function fetchFloorplanBlob(
  raw: string,
  maxBytes = FLOORPLAN_BLOB_MAX_BYTES,
): Promise<FetchedFloorplanBlob | null> {
  if (!isFloorplanBlobUrl(raw)) {
    log.warn("refused a plan URL that is not on the project's blob host");
    return null;
  }
  try {
    const res = await fetch(raw, { cache: "no-store" });
    if (!res.ok) {
      log.warn("blob fetch failed", { status: res.status });
      return null;
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) return null;
    return {
      base64: buffer.toString("base64"),
      mimeType: res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
      fileName: floorplanBlobFileName(raw),
      bytes: buffer.byteLength,
    };
  } catch (err: unknown) {
    log.warn("blob fetch threw", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * The run keeps its own copy of the plan, so the upload is rubbish the moment
 * it is saved. Never throws: a blob left behind is cheaper than a failed run.
 */
export async function deleteFloorplanBlob(raw: string): Promise<void> {
  if (!isFloorplanBlobUrl(raw)) return;
  try {
    // Imported here, not at the top: the SDK pulls in an ESM-only dependency,
    // and the URL guards above are used by callers that never delete anything.
    const { del } = await import("@vercel/blob");
    await del(raw);
  } catch (err: unknown) {
    log.warn("blob delete failed; it will age out", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
