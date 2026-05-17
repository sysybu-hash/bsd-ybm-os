import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { GoogleAssistantService } from "@/lib/services/google-assistant";

const queryBodySchema = z.object({
  query: z.string().min(1),
});

export const POST = withWorkspacesAuth(
  async (_req, { userId }, data) => {
    try {
      const assistantService = await GoogleAssistantService.forUser(userId);
      const result = await assistantService.query(data.query);

      return NextResponse.json(result);
    } catch (error: unknown) {
      return apiErrorResponse(error, "os/google-assistant/query");
    }
  },
  { schema: queryBodySchema },
);
