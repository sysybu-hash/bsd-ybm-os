import { prisma } from "@/lib/prisma";

export type NotebookSourceInput = {
  name: string;
  content: string;
  mimeType?: string;
  sortOrder?: number;
};

export type NotebookMessageInput = {
  role: string;
  content: string;
};

export type SaveNotebookInput = {
  id?: string;
  title: string;
  projectId?: string | null;
  sources: NotebookSourceInput[];
  messages: NotebookMessageInput[];
};

export function serializeNotebook(
  nb: {
    id: string;
    title: string;
    projectId: string | null;
    createdAt: Date;
    updatedAt: Date;
    sources: Array<{ id: string; name: string; content: string; mimeType: string; sortOrder: number }>;
    messages: Array<{ id: string; role: string; content: string; createdAt: Date }>;
    audioOverview: { scriptText: string; createdAt: Date } | null;
  },
) {
  return {
    id: nb.id,
    title: nb.title,
    projectId: nb.projectId,
    createdAt: nb.createdAt.toISOString(),
    updatedAt: nb.updatedAt.toISOString(),
    sources: nb.sources.map((s) => ({
      id: s.id,
      name: s.name,
      content: s.content,
      mimeType: s.mimeType,
      sortOrder: s.sortOrder,
    })),
    messages: nb.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    audioOverview: nb.audioOverview
      ? {
          scriptText: nb.audioOverview.scriptText,
          createdAt: nb.audioOverview.createdAt.toISOString(),
        }
      : null,
  };
}

const notebookInclude = {
  sources: { orderBy: { sortOrder: "asc" as const } },
  messages: { orderBy: { createdAt: "asc" as const } },
  audioOverview: true,
};

export async function listNotebooksForUser(userId: string, projectId?: string) {
  return prisma.notebook.findMany({
    where: {
      userId,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      projectId: true,
      updatedAt: true,
      createdAt: true,
      _count: { select: { sources: true, messages: true } },
    },
  });
}

export async function getNotebookForUser(userId: string, id: string) {
  return prisma.notebook.findFirst({
    where: { id, userId },
    include: notebookInclude,
  });
}

export async function saveNotebookForUser(
  userId: string,
  organizationId: string | null | undefined,
  input: SaveNotebookInput,
) {
  const { sources, messages, title, projectId } = input;

  if (input.id) {
    const existing = await prisma.notebook.findFirst({
      where: { id: input.id, userId },
    });
    if (!existing) return null;

    await prisma.$transaction([
      prisma.notebookSource.deleteMany({ where: { notebookId: input.id } }),
      prisma.notebookMessage.deleteMany({ where: { notebookId: input.id } }),
      prisma.notebook.update({
        where: { id: input.id },
        data: {
          title: title.trim() || "מחברת ללא שם",
          projectId: projectId ?? null,
        },
      }),
      prisma.notebookSource.createMany({
        data: sources.map((s, i) => ({
          notebookId: input.id!,
          name: s.name,
          content: s.content,
          mimeType: s.mimeType ?? "application/pdf",
          sortOrder: s.sortOrder ?? i,
        })),
      }),
      prisma.notebookMessage.createMany({
        data: messages.map((m) => ({
          notebookId: input.id!,
          role: m.role,
          content: m.content,
        })),
      }),
    ]);

    return getNotebookForUser(userId, input.id);
  }

  const created = await prisma.notebook.create({
    data: {
      userId,
      organizationId: organizationId ?? null,
      title: title.trim() || "מחברת ללא שם",
      projectId: projectId ?? null,
      sources: {
        create: sources.map((s, i) => ({
          name: s.name,
          content: s.content,
          mimeType: s.mimeType ?? "application/pdf",
          sortOrder: s.sortOrder ?? i,
        })),
      },
      messages: {
        create: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
    },
    include: notebookInclude,
  });

  return created;
}

export async function deleteNotebookForUser(userId: string, id: string) {
  const existing = await prisma.notebook.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await prisma.notebook.delete({ where: { id } });
  return true;
}

export async function upsertAudioOverview(notebookId: string, userId: string, scriptText: string) {
  const nb = await prisma.notebook.findFirst({ where: { id: notebookId, userId } });
  if (!nb) return null;
  return prisma.notebookAudioOverview.upsert({
    where: { notebookId },
    create: { notebookId, scriptText },
    update: { scriptText },
  });
}
