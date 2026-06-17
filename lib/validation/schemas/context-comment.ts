import { z } from "zod";

export const contextCommentTargetTypeSchema = z.enum(["TASK", "DOC"]);

export const listCommentsQuerySchema = z.object({
  targetType: contextCommentTargetTypeSchema,
  targetId: z.string().min(1).max(64),
});

export const createCommentSchema = z.object({
  targetType: contextCommentTargetTypeSchema,
  targetId: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
});

export const contextCommentRowSchema = z.object({
  id: z.string(),
  targetType: contextCommentTargetTypeSchema,
  targetId: z.string(),
  text: z.string(),
  createdAt: z.string(),
  authorName: z.string().nullable(),
  authorUserId: z.string(),
});

export type ContextCommentRow = z.infer<typeof contextCommentRowSchema>;
