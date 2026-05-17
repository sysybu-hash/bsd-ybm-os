import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { createProjectNote, listProjectNotes } from "@/lib/workspace-api/project-detail";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  try {
    const notes = await listProjectNotes(orgId, id);
    return NextResponse.json(notes);
  } catch (error) {
    return apiErrorResponse(error, "Project notes GET");
  }
});

const createSchema = z.object({
  content: z.string().min(1),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId, userId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const note = await createProjectNote(orgId, userId, id, body.content);
      if (!note) {
        return jsonNotFound("פרויקט לא נמצא");
      }
      return NextResponse.json(note);
    } catch (error) {
      return apiErrorResponse(error, "Project notes POST");
    }
  },
  { schema: createSchema },
);
