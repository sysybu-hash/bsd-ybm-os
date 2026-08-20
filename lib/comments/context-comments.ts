import { prisma } from "@/lib/prisma";
import type { ContextCommentRow } from "@/lib/validation/schemas/context-comment";

export async function verifyCommentTarget(
  orgId: string,
  targetType: "TASK" | "DOC",
  targetId: string,
): Promise<boolean> {
  if (targetType === "TASK") {
    const task = await prisma.task.findFirst({
      where: { id: targetId, organizationId: orgId },
      select: { id: true },
    });
    return Boolean(task);
  }
  const issued = await prisma.issuedDocument.findFirst({
    where: { id: targetId, organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (issued) return true;

  const scanned = await prisma.document.findFirst({
    where: { id: targetId, organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  return Boolean(scanned);
}

export async function listContextComments(
  orgId: string,
  targetType: "TASK" | "DOC",
  targetId: string,
): Promise<ContextCommentRow[]> {
  const rows = await prisma.contextComment.findMany({
    where: { organizationId: orgId, targetType, targetId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    targetType: row.targetType as ContextCommentRow["targetType"],
    targetId: row.targetId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    authorName: row.author.name,
    authorUserId: row.authorUserId,
  }));
}

export async function createContextComment(input: {
  organizationId: string;
  authorUserId: string;
  targetType: "TASK" | "DOC";
  targetId: string;
  text: string;
}): Promise<ContextCommentRow> {
  const row = await prisma.contextComment.create({
    data: {
      organizationId: input.organizationId,
      authorUserId: input.authorUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      text: input.text.trim(),
    },
    include: { author: { select: { name: true } } },
  });

  return {
    id: row.id,
    targetType: row.targetType as ContextCommentRow["targetType"],
    targetId: row.targetId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    authorName: row.author.name,
    authorUserId: row.authorUserId,
  };
}
