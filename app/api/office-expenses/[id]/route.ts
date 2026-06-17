import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import {
  logOfficeExpenseAudit,
  officeExpenseAuditDetails,
} from "@/lib/office-expenses-audit";
import { OFFICE_EXPENSE_MANAGE_ROLES } from "@/lib/office-expenses-auth";
import { deleteOfficeExpense, updateOfficeExpense } from "@/lib/workspace-api/office-expenses";
import { updateOfficeExpenseSchema } from "@/lib/validation/schemas/office-expenses";

export const dynamic = "force-dynamic";

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof updateOfficeExpenseSchema>(
  async (_req, { orgId, userId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const expense = await updateOfficeExpense(orgId, id, body);
      if (!expense) return jsonNotFound("הוצאת משרד לא נמצאה");
      await logOfficeExpenseAudit(
        userId,
        orgId,
        "updated",
        officeExpenseAuditDetails({
          id: expense.id,
          vendor: expense.vendorName,
          total: expense.total,
        }),
      );
      return NextResponse.json(expense);
    } catch (error) {
      return apiErrorResponse(error, "Office expenses PATCH");
    }
  },
  { schema: updateOfficeExpenseSchema, allowedRoles: OFFICE_EXPENSE_MANAGE_ROLES },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { orgId, userId }, segment) => {
    const { id } = await segment.params;
    try {
      const deleted = await deleteOfficeExpense(orgId, id);
      if (!deleted) return jsonNotFound("הוצאת משרד לא נמצאה");
      await logOfficeExpenseAudit(userId, orgId, "deleted", officeExpenseAuditDetails({ id }));
      return NextResponse.json({ ok: true });
    } catch (error) {
      return apiErrorResponse(error, "Office expenses DELETE");
    }
  },
  { allowedRoles: OFFICE_EXPENSE_MANAGE_ROLES },
);
