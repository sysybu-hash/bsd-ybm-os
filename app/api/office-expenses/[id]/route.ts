import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { deleteOfficeExpense, updateOfficeExpense } from "@/lib/workspace-api/office-expenses";
import { updateOfficeExpenseSchema } from "@/lib/validation/schemas/office-expenses";

export const dynamic = "force-dynamic";

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof updateOfficeExpenseSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const expense = await updateOfficeExpense(orgId, id, body);
      if (!expense) return jsonNotFound("הוצאת משרד לא נמצאה");
      return NextResponse.json(expense);
    } catch (error) {
      return apiErrorResponse(error, "Office expenses PATCH");
    }
  },
  { schema: updateOfficeExpenseSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  try {
    const deleted = await deleteOfficeExpense(orgId, id);
    if (!deleted) return jsonNotFound("הוצאת משרד לא נמצאה");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Office expenses DELETE");
  }
});
