import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import { deleteNotebookForUser, getNotebookForUser, serializeNotebook } from "@/lib/notebooklm-db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonUnauthorized();

  const { id } = await params;
  const nb = await getNotebookForUser(session.user.id, id);
  if (!nb) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

  return NextResponse.json({ notebook: serializeNotebook(nb) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonUnauthorized();

  const { id } = await params;
  const ok = await deleteNotebookForUser(session.user.id, id);
  if (!ok) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

  return NextResponse.json({ ok: true });
}
