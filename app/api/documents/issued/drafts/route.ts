import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/drafts");

const draftPayloadSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().optional(),
          description: z.string().optional(),
          quantity: z.number().optional(),
          price: z.number().optional(),
        }),
      )
      .optional(),
    dueDate: z.string().optional(),
    paymentMethod: z.string().optional(),
    contactId: z.string().nullable().optional(),
    clientName: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const upsertSchema = z.object({
  docType: z.string().min(1),
  payload: draftPayloadSchema,
});

/**
 * GET /api/documents/issued/drafts?docType=INVOICE
 * → { draft: DocumentDraft | null }
 */
export const GET = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get("docType");
  if (!docType) {
    return NextResponse.json({ error: "Missing docType" }, { status: 400 });
  }
  try {
    const draft = await prisma.documentDraft.findUnique({
      where: { draft_per_user_doctype: { organizationId: orgId, userId, docType } },
    });
    return NextResponse.json({ draft });
  } catch (err) {
    log.error("GET draft failed", err);
    return NextResponse.json({ error: "Failed to load draft" }, { status: 500 });
  }
});

/**
 * POST /api/documents/issued/drafts
 * body: { docType, payload } → upsert
 */
export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const draft = await prisma.documentDraft.upsert({
      where: {
        draft_per_user_doctype: {
          organizationId: orgId,
          userId,
          docType: parsed.data.docType,
        },
      },
      create: {
        organizationId: orgId,
        userId,
        docType: parsed.data.docType,
        payload: parsed.data.payload as Prisma.InputJsonValue,
      },
      update: { payload: parsed.data.payload as Prisma.InputJsonValue },
    });
    return NextResponse.json({ draft });
  } catch (err) {
    log.error("upsert draft failed", err);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
});

/**
 * DELETE /api/documents/issued/drafts?docType=INVOICE
 * → { ok: true }
 */
export const DELETE = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get("docType");
  if (!docType) {
    return NextResponse.json({ error: "Missing docType" }, { status: 400 });
  }
  try {
    await prisma.documentDraft.deleteMany({
      where: { organizationId: orgId, userId, docType },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("delete draft failed", err);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
});
