import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("whatsapp-client");

function apiVersion(): string {
  return env.WHATSAPP_API_VERSION?.trim() || "v21.0";
}

function graphBase(): string {
  return `https://graph.facebook.com/${apiVersion()}`;
}

export function isWhatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN?.trim() && env.WHATSAPP_PHONE_NUMBER_ID?.trim());
}

/** Downloads media by id: first resolves the media URL, then fetches the bytes. */
export async function downloadWhatsappMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) return null;
  try {
    const metaRes = await fetch(`${graphBase()}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      log.warn("media meta fetch failed", { mediaId, status: metaRes.status });
      return null;
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) {
      log.warn("media bytes fetch failed", { mediaId, status: binRes.status });
      return null;
    }
    const buffer = Buffer.from(await binRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? "application/octet-stream" };
  } catch (err) {
    log.error("media download error", { mediaId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Sends a plain-text WhatsApp message to a recipient (E.164 without "+"). */
export async function sendWhatsappText(to: string, body: string): Promise<boolean> {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return false;
  try {
    const res = await fetch(`${graphBase()}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: body.slice(0, 4096) },
      }),
    });
    if (!res.ok) {
      log.warn("send text failed", { to, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("send text error", { to, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
