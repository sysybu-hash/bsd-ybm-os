import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";
import type { InlineScanFilePayload } from "@/lib/analyze-queue";
import { downloadWhatsappMedia, sendWhatsappText } from "@/lib/whatsapp/client";
import { consumeWhatsappLinkCode, extractLinkCode } from "@/lib/whatsapp/link-codes";
import type { WhatsappInbound } from "@/lib/whatsapp/parse";
import {
  replyBadCode,
  replyLinked,
  replyNeedCode,
  replyScanQueued,
  replyScanResult,
  replyUnknownNumber,
  replyUnsupported,
} from "@/lib/whatsapp/replies";

const log = createLogger("whatsapp-process");

// ── processor ───────────────────────────────────────────────────────────────

async function handleText(from: string, text: string): Promise<string> {
  const code = extractLinkCode(text);
  if (!code) {
    const existing = await prisma.whatsappLink.findUnique({ where: { phone: from } });
    return existing ? replyUnsupported() : replyNeedCode();
  }
  const payload = await consumeWhatsappLinkCode(code);
  if (!payload) return replyBadCode();

  await prisma.whatsappLink.upsert({
    where: { phone: from },
    create: {
      phone: from,
      organizationId: payload.organizationId,
      userId: payload.userId,
    },
    update: {
      organizationId: payload.organizationId,
      userId: payload.userId,
      verifiedAt: new Date(),
    },
  });
  return replyLinked();
}

async function handleMedia(
  from: string,
  media: Extract<WhatsappInbound, { kind: "media" }>,
): Promise<string> {
  const link = await prisma.whatsappLink.findUnique({ where: { phone: from } });
  if (!link) return replyUnknownNumber();

  const downloaded = await downloadWhatsappMedia(media.mediaId);
  if (!downloaded) return "הורדת הקובץ מ-WhatsApp נכשלה. נסו לשלוח שוב.";

  const payload: InlineScanFilePayload = {
    kind: "inline",
    base64: downloaded.buffer.toString("base64"),
    fileName: media.fileName,
    mimeType: downloaded.mimeType || media.mimeType,
    provider: "gemini",
    analysisType: "INVOICE",
    industry: "CONSTRUCTION",
    language: "auto",
    model: "",
    persist: true,
  };

  const job = await prisma.documentScanJob.create({
    data: {
      status: "PENDING",
      fileData: JSON.stringify(payload),
      userId: link.userId,
      organizationId: link.organizationId,
    },
  });

  await prisma.whatsappLink.update({
    where: { id: link.id },
    data: { lastMessageAt: new Date() },
  });

  // Drain this job synchronously so we can reply with the extracted summary.
  try {
    await drainDocumentScanQueue(3);
  } catch (err) {
    log.warn("drain after whatsapp media failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return replyScanQueued();
  }

  const done = await prisma.documentScanJob.findUnique({ where: { id: job.id } });
  const result = done?.result as { v5?: { vendor?: string; total?: number } } | null;
  if (done?.status === "COMPLETED" && result?.v5) {
    return replyScanResult(result.v5.vendor ?? "", Number(result.v5.total ?? 0));
  }
  return replyScanQueued();
}

/** מטפל בהודעה נכנסת אחת ומשיב ב-WhatsApp. */
export async function processWhatsappInbound(msg: WhatsappInbound): Promise<void> {
  try {
    const reply =
      msg.kind === "text" ? await handleText(msg.from, msg.text) : await handleMedia(msg.from, msg);
    await sendWhatsappText(msg.from, reply);
  } catch (err) {
    log.error("process inbound failed", {
      from: msg.from,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
