import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import {
  createContextComment,
  listContextComments,
  verifyCommentTarget,
} from "@/lib/comments/context-comments";
import { emitProjectMutation } from "@/lib/events/project-sync";
import { prisma } from "@/lib/prisma";
import {
  createCommentSchema,
  listCommentsQuerySchema,
} from "@/lib/validation/schemas/context-comment";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(
  async (req, { orgId }) => {
    try {
      const params = Object.fromEntries(new URL(req.url).searchParams.entries());
      const parsed = listCommentsQuerySchema.safeParse(params);
      if (!parsed.success) {
        return jsonBadRequest("פרמטרים לא תקינים");
      }

      const ok = await verifyCommentTarget(orgId, parsed.data.targetType, parsed.data.targetId);
      if (!ok) return jsonNotFound("היעד לא נמצא");

      const comments = await listContextComments(
        orgId,
        parsed.data.targetType,
        parsed.data.targetId,
      );
      return NextResponse.json({ comments });
    } catch (error) {
      return apiErrorResponse(error, "Comments GET");
    }
  },
  { rateLimit: { key: "comments:list", limit: 60, windowMs: 60_000 } },
);

export const POST = withWorkspacesAuth(
  async (req, { orgId, userId }) => {
    try {
      const body: unknown = await req.json();
      const parsed = createCommentSchema.safeParse(body);
      if (!parsed.success) {
        return jsonBadRequest("גוף הבקשה לא תקין");
      }

      if (!userId) return jsonBadRequest("משתמש לא מזוהה");

      const ok = await verifyCommentTarget(orgId, parsed.data.targetType, parsed.data.targetId);
      if (!ok) return jsonNotFound("היעד לא נמצא");

      const comment = await createContextComment({
        organizationId: orgId,
        authorUserId: userId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        text: parsed.data.text,
      });

      if (parsed.data.targetType === "TASK") {
        const task = await prisma.task.findFirst({
          where: { id: parsed.data.targetId, organizationId: orgId },
          select: { projectId: true },
        });
        if (task?.projectId) emitProjectMutation(task.projectId);
      }

      return NextResponse.json({ comment });
    } catch (error) {
      return apiErrorResponse(error, "Comments POST");
    }
  },
  { rateLimit: { key: "comments:create", limit: 30, windowMs: 60_000 } },
);
