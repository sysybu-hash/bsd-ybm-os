import "server-only";
import { del, get, head, put, type HeadBlobResult } from "@vercel/blob";
import { env } from "@/lib/env";

/**
 * A project's files in Blob: the client's sheets, the booklet and the studio.
 *
 * They go to the private store when VMB_BLOB_READ_WRITE_TOKEN is set: its addresses answer only with that token, and
 * the office reads them through routes that check it is theirs. Without it, the platform's public store (an address
 * with a random suffix) stays the fallback until the private store is connected. Files already written keep the store
 * they were written to: reads, heads and deletes go by the address.
 */

export type ProjectBlobAccess = "private" | "public";

export function projectBlobAccess(): ProjectBlobAccess {
  return env.VMB_BLOB_READ_WRITE_TOKEN ? "private" : "public";
}

/** The token that writes to the store new files go to (handleUpload's `token`). */
export function projectBlobWriteToken(): string | undefined {
  return env.VMB_BLOB_READ_WRITE_TOKEN ?? env.BLOB_READ_WRITE_TOKEN;
}

const host = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
};

const isPrivateUrl = (raw: string) => /(^|\.)private\.blob\.vercel-storage\.com$/i.test(host(raw) ?? "");

/** Only Vercel Blob's own hosts, private or public: anything else is a URL a caller chose for us. */
export function isProjectBlobUrl(raw: string): boolean {
  return /(^|\.)(private|public)\.blob\.vercel-storage\.com$/i.test(host(raw) ?? "");
}

const tokenFor = (url: string) => (isPrivateUrl(url) ? env.VMB_BLOB_READ_WRITE_TOKEN : env.BLOB_READ_WRITE_TOKEN);

export async function putProjectBlob(pathname: string, body: Buffer, contentType: string): Promise<string> {
  const access = projectBlobAccess();
  const blob = await put(pathname, body, { access, contentType, addRandomSuffix: true, token: projectBlobWriteToken() });
  return blob.url;
}

/** The file's bytes, or null when it is not a project file, is missing, or is larger than `maxBytes`. */
export async function readProjectBlob(url: string, maxBytes = Infinity): Promise<Buffer | null> {
  if (!isProjectBlobUrl(url)) return null;
  let bytes: ArrayBuffer;
  if (isPrivateUrl(url)) {
    const token = env.VMB_BLOB_READ_WRITE_TOKEN;
    if (!token) return null;
    const got = await get(url, { access: "private", token });
    if (!got || got.statusCode !== 200 || !got.stream) return null;
    bytes = await new Response(got.stream).arrayBuffer();
  } else {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    bytes = await res.arrayBuffer();
  }
  return bytes.byteLength > maxBytes ? null : Buffer.from(bytes);
}

export async function headProjectBlob(url: string): Promise<HeadBlobResult> {
  return head(url, { token: tokenFor(url) });
}

/** Deletes each address with its own store's token. */
export async function deleteProjectBlobs(urls: string[]): Promise<void> {
  const priv = urls.filter(isPrivateUrl);
  const pub = urls.filter((u) => !isPrivateUrl(u));
  if (priv.length) await del(priv, { token: env.VMB_BLOB_READ_WRITE_TOKEN });
  if (pub.length) await del(pub, { token: env.BLOB_READ_WRITE_TOKEN });
}
