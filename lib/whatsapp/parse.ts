/**
 * Normalizes a Meta WhatsApp Cloud API webhook payload into a flat list of
 * inbound messages the processor can act on. See:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

export type WhatsappInboundText = {
  kind: "text";
  from: string; // E.164 without "+"
  messageId: string;
  text: string;
};

export type WhatsappInboundMedia = {
  kind: "media";
  from: string;
  messageId: string;
  mediaId: string;
  mimeType: string;
  fileName: string;
  caption: string | null;
};

export type WhatsappInbound = WhatsappInboundText | WhatsappInboundMedia;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseWhatsappWebhook(payload: unknown): WhatsappInbound[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account") return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const out: WhatsappInbound[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(asRecord(entry)?.changes) ? (asRecord(entry)!.changes as unknown[]) : [];
    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      if (!value) continue;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const raw of messages) {
        const m = asRecord(raw);
        if (!m) continue;
        const from = str(m.from);
        const messageId = str(m.id);
        if (!from || !messageId) continue;
        const type = str(m.type);

        if (type === "text") {
          const body = str(asRecord(m.text)?.body);
          if (body) out.push({ kind: "text", from, messageId, text: body });
          continue;
        }

        if (type === "image" || type === "document") {
          const media = asRecord(m[type]);
          const mediaId = str(media?.id);
          if (!mediaId) continue;
          const mimeType = str(media?.mime_type) ?? (type === "image" ? "image/jpeg" : "application/pdf");
          const fileName =
            str(media?.filename) ?? `whatsapp-${type}-${messageId}.${type === "image" ? "jpg" : "pdf"}`;
          out.push({
            kind: "media",
            from,
            messageId,
            mediaId,
            mimeType,
            fileName,
            caption: str(media?.caption),
          });
        }
      }
    }
  }
  return out;
}
