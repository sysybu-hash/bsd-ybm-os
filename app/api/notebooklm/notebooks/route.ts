import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import {
  listNotebooksForUser,
  saveNotebookForUser,
  serializeNotebook,
  type SaveNotebookInput,
} from "@/lib/notebooklm-db";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonUnauthorized();

  const url = new URL(req.url);
  const projectIdParam = url.searchParams.get("projectId");
  const projectId = projectIdParam && projectIdParam.length > 0 ? projectIdParam : undefined;

  const items = await listNotebooksForUser(session.user.id, projectId);

  return NextResponse.json({
    notebooks: items.map((n: (typeof items)[number]) => ({
      id: n.id,
      title: n.title,
      projectId: n.projectId,
      updatedAt: n.updatedAt.toISOString(),
      createdAt: n.createdAt.toISOString(),
      sourceCount: n._count.sources,
      messageCount: n._count.messages,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonUnauthorized();

  const body = (await req.json().catch(() => ({}))) as SaveNotebookInput;
  if (!body.title && !body.id) {
    return jsonBadRequest("חסרה כותרת למחברת.", "missing_title");
  }

  const saved = await saveNotebookForUser(session.user.id, session.user.organizationId, {
    id: body.id,
    title: body.title ?? "מחברת",
    projectId: body.projectId,
    sources: Array.isArray(body.sources) ? body.sources : [],
    messages: Array.isArray(body.messages) ? body.messages : [],
  });

  if (!saved) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

  return NextResponse.json({ notebook: serializeNotebook(saved) });
}
