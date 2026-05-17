import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { confirmExpense } from "@/lib/workspace-api/confirm-expense";

const bodySchema = z.object({
  amount: z.union([z.number(), z.string()]),
  projectName: z.string().optional(),
  vendor: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, body) => {
    try {
      const result = await confirmExpense(orgId, body);
      if (!result.ok) {
        return jsonBadRequest(result.error);
      }
      return NextResponse.json(result);
    } catch (error) {
      return apiErrorResponse(error, "Confirm expense POST");
    }
  },
  { schema: bodySchema },
);
