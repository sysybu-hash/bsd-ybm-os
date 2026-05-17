import { prisma } from "@/lib/prisma";

export async function listProjects(orgId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isActive: true },
  });
  return { projects };
}

export async function getProjectByName(orgId: string, query: string) {
  const project = await prisma.project.findFirst({
    where: { name: query.trim(), organizationId: orgId },
    include: { expenseRecords: true },
  });

  if (project) {
    const projectExpenses = project.expenseRecords.reduce((sum, e) => sum + e.total, 0);
    let attendance: unknown[] = [];
    try {
      const { getMeckanoAttendanceForProject } = await import("@/lib/meckano-access");
      attendance = await getMeckanoAttendanceForProject(project.id, orgId);
    } catch (e) {
      console.warn("Meckano sync failed for project", e);
    }

    const primaryContact = await prisma.contact.findFirst({
      where: { projectId: project.id, organizationId: orgId },
      select: { name: true },
    });

    return {
      id: project.id,
      name: project.name,
      client: primaryContact?.name ?? "לקוח מ-DB",
      budget: project.budget,
      expenses: projectExpenses,
      health:
        project.budget > 0
          ? Math.round(((project.budget - projectExpenses) / project.budget) * 100)
          : 100,
      expensesList: project.expenseRecords.map((exp) => ({
        id: exp.id,
        amount: exp.total,
        vendor: exp.vendorName || null,
        date: exp.expenseDate ? exp.expenseDate.toISOString() : null,
        createdAt: exp.createdAt.toISOString(),
      })),
      attendanceLogs: attendance,
    };
  }

  return {
    id: "",
    name: query,
    client: "לא נמצא",
    budget: 0,
    expenses: 0,
    health: 100,
    expensesList: [],
    attendanceLogs: [],
  };
}

const NOTE_ACTION = "PROJECT_NOTE";

export async function listProjectNotes(orgId: string, projectId: string) {
  const logs = await prisma.activityLog.findMany({
    where: { organizationId: orgId, action: NOTE_ACTION },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return logs
    .map((log) => {
      try {
        const parsed = JSON.parse(log.details ?? "{}") as { projectId?: string; content?: string };
        if (parsed.projectId !== projectId) return null;
        return {
          id: log.id,
          content: parsed.content ?? "",
          createdAt: log.createdAt.toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function createProjectNote(
  orgId: string,
  userId: string,
  projectId: string,
  content: string,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
  });
  if (!project) {
    return null;
  }

  const log = await prisma.activityLog.create({
    data: {
      organizationId: orgId,
      userId,
      action: NOTE_ACTION,
      details: JSON.stringify({ projectId, content }),
    },
  });

  return {
    id: log.id,
    content,
    createdAt: log.createdAt.toISOString(),
  };
}
