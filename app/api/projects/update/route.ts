import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const organizationId = session?.user?.organizationId;

    // For demo/dev if no session, we might want to return all or a default org's tasks
    const where = organizationId ? { organizationId } : {};

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Map DB Task to UI Task format
    const mappedTasks = tasks.map(t => ({
      id: t.id,
      title: t.title,
      project: t.project.name,
      clientName: 'לקוח מ-DB', // We could fetch this from project.contacts if needed
      budget: 0, // We might need to add budget to Task model if it's per task
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      dueDate: t.dueDate ? t.dueDate.toISOString().split('T')[0] : '',
    }));

    return NextResponse.json(mappedTasks);
  } catch (error: any) {
    console.error("Fetch Tasks Error:", error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    let organizationId = session?.user?.organizationId;

    if (!organizationId) {
      const defaultOrg = await prisma.organization.findFirst();
      if (!defaultOrg) {
        return NextResponse.json({ error: 'No organization found' }, { status: 500 });
      }
      organizationId = defaultOrg.id;
    }

    const body = await request.json();
    const { id, status, budget, title, projectName, priority, dueDate } = body;

    // Check if it's an update for an existing task (id is a cuid, not a timestamp string from UI)
    const isExistingTask = id && !/^\d+$/.test(id);

    if (isExistingTask) {
      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          status: status ? status.toUpperCase() : undefined,
          priority: priority ? priority.toUpperCase() : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          title: title || undefined,
          // budget is not in the Task model yet, but we could use description or a new field
          description: budget ? `Budget: ${budget}` : undefined,
        }
      });
      return NextResponse.json({ success: true, task: updatedTask });
    } else {
      // Create new task
      // 1. Find or create project
      let project = await prisma.project.findFirst({
        where: { name: projectName, organizationId }
      });

      if (!project) {
        project = await prisma.project.create({
          data: {
            name: projectName,
            organizationId
          }
        });
      }

      const newTask = await prisma.task.create({
        data: {
          title: title,
          status: status ? status.toUpperCase() : 'TODO',
          priority: priority ? priority.toUpperCase() : 'MEDIUM',
          dueDate: dueDate ? new Date(dueDate) : null,
          projectId: project.id,
          organizationId: organizationId,
          description: budget ? `Budget: ${budget}` : null,
        }
      });

      return NextResponse.json({ success: true, task: newTask });
    }
  } catch (error: any) {
    console.error("Project/Task Update Error:", error);
    return NextResponse.json({ error: 'Sync failed', details: error.message }, { status: 500 });
  }
}
