import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { createVmbProjectSchema } from "@/lib/validation/schemas/vmb-projects";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { listProjects } from "@/lib/vmb/projects";
import { ensureWorkspace } from "@/lib/vmb/workspace";

export const dynamic = "force-dynamic";

/** The user's projects, newest first, each with its latest job for the progress bar. */
export const GET = withVmbAuth(async (req, { user }) => {
  const limited = await applyRateLimit(req, "vmb:projects-list", 60, 60_000);
  if (limited) return limited;
  return NextResponse.json({ projects: await listProjects(user.id) });
});

/** Opens a new project in the user's office. Files and jobs come after. */
export const POST = withVmbAuth(async (req, { user }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:projects-create", 20, 60_000);
  if (limited) return limited;
  const parsed = createVmbProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid" }, { status: 400 });
  const ws = await ensureWorkspace(user);
  const project = await prisma.vmbProject.create({
    data: { workspaceId: ws.id, createdById: user.id, name: parsed.data.name, kind: parsed.data.kind },
    select: { id: true, name: true, kind: true, status: true, updatedAt: true },
  });
  return NextResponse.json({ project }, { status: 201 });
});
