import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { handleDataGet, handleDataPost } from "@/lib/data-api-handlers";

const dataQuerySchema = z.object({
  type: z.string().min(1),
  query: z.string().optional(),
});

const dataPostSchema = z
  .object({
    type: z.string().min(1),
  })
  .passthrough();

export const GET = withWorkspacesAuth(
  async (req, ctx, data) => handleDataGet(req, ctx),
  { schema: dataQuerySchema, parseTarget: "query" },
);

export const POST = withWorkspacesAuth(
  async (req, ctx, data) => handleDataPost(req, ctx, data),
  { schema: dataPostSchema },
);
