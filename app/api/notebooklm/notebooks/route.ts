import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import {
  listNotebooksForUser,
  saveNotebookForUser,
  serializeNotebook,
  type SaveNotebookInput,
} from "@/lib/notebooklm-db";

const saveNotebookSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  projectId: z.string().nullable().optional(),
  sources: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()).optional(),
});

export const GET = withWorkspacesAuth(
  async (req, { userId }) => {
    const url = new URL(req.url);
    const projectIdParam = url.searchParams.get("projectId");
    const projectId = projectIdParam && projectIdParam.length > 0 ? projectIdParam : undefined;

    const items = await listNotebooksForUser(userId, projectId);

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
  },
  { parseTarget: "query" },
);

export const POST = withWorkspacesAuth(
  async (_req, { userId, orgId }, data) => {
    if (!data.title && !data.id) {
      return jsonBadRequest("חסרה כותרת למחברת.", "missing_title");
    }

    const payload: SaveNotebookInput = {
      id: data.id,
      title: data.title ?? "מחברת",
      projectId: data.projectId,
      sources: Array.isArray(data.sources) ? (data.sources as SaveNotebookInput["sources"]) : [],
      messages: Array.isArray(data.messages) ? (data.messages as SaveNotebookInput["messages"]) : [],
    };
    const saved = await saveNotebookForUser(userId, orgId, payload);

    if (!saved) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

    return NextResponse.json({ notebook: serializeNotebook(saved) });
  },
  { schema: saveNotebookSchema },
);
