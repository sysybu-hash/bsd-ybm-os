import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { deleteNotebookForUser, getNotebookForUser, serializeNotebook } from "@/lib/notebooklm-db";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { userId }, segment) => {
    const { id } = await segment.params;
    const nb = await getNotebookForUser(userId, id);
    if (!nb) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

    return NextResponse.json({ notebook: serializeNotebook(nb) });
  },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { userId }, segment) => {
    const { id } = await segment.params;
    const ok = await deleteNotebookForUser(userId, id);
    if (!ok) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

    return NextResponse.json({ ok: true });
  },
);
