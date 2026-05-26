import archiver from "archiver";
import { PassThrough } from "stream";
import type { ErpArchiveFile } from "@/lib/erp-archive";
import { buildInvoicePdfBuffer } from "@/lib/invoice-export";
import { buildInvoiceExportPayload } from "@/lib/invoice-payload";
import { prisma } from "@/lib/prisma";
import { documentTypeLabel } from "@/lib/document-types";

const MAX_ITEMS = 50;

export type BulkExportItem = {
  source: "issued" | "document";
  sourceId: string;
};

function streamToBuffer(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function buildArchiveBulkZip(
  orgId: string,
  items: BulkExportItem[],
): Promise<Buffer> {
  if (items.length === 0) throw new Error("NO_ITEMS");
  if (items.length > MAX_ITEMS) throw new Error("TOO_MANY_ITEMS");

  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      taxId: true,
      vatRatePercent: true,
      address: true,
      paypalMerchantEmail: true,
      companyType: true,
      isReportable: true,
    },
  });
  if (!org) throw new Error("ORG_NOT_FOUND");

  for (const item of items) {
    if (item.source === "issued") {
      const doc = await prisma.issuedDocument.findFirst({
        where: { id: item.sourceId, organizationId: orgId, deletedAt: null },
      });
      if (!doc) continue;
      const payload = buildInvoiceExportPayload(doc, org);
      const buffer = await buildInvoicePdfBuffer(payload);
      const label = documentTypeLabel(doc.type);
      archive.append(Buffer.from(buffer), { name: `issued/${label}_${doc.number}.pdf` });
    } else {
      const doc = await prisma.document.findFirst({
        where: { id: item.sourceId, organizationId: orgId, deletedAt: null },
        include: { lineItems: true },
      });
      if (!doc) continue;
      const meta = {
        fileName: doc.fileName,
        type: doc.type,
        createdAt: doc.createdAt.toISOString(),
        aiData: doc.aiData,
        lineItems: doc.lineItems,
      };
      archive.append(JSON.stringify(meta, null, 2), { name: `scans/${doc.fileName || doc.id}.json` });
    }
  }

  await archive.finalize();
  return streamToBuffer(passthrough);
}

export function parseBulkExportItems(
  raw: unknown,
  allowedFiles: ErpArchiveFile[],
): BulkExportItem[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Map(allowedFiles.map((f) => [`${f.source}:${f.sourceId}`, f]));
  const out: BulkExportItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const source = (entry as { source?: string }).source;
    const sourceId = (entry as { sourceId?: string }).sourceId;
    if ((source !== "issued" && source !== "document") || !sourceId?.trim()) continue;
    const key = `${source}:${sourceId}`;
    if (!allowed.has(key)) continue;
    out.push({ source, sourceId: sourceId.trim() });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
