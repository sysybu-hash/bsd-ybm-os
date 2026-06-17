import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createOfficeExpense, listOfficeExpenses } from "@/lib/workspace-api/office-expenses";
import {
  createOfficeExpenseSchema,
  listOfficeExpensesQuerySchema,
} from "@/lib/validation/schemas/office-expenses";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
    const parsed = listOfficeExpensesQuerySchema.safeParse(raw);
    const query = parsed.success ? parsed.data : {};
    const expenses = await listOfficeExpenses(orgId, query);
    return NextResponse.json({ expenses });
  } catch (error) {
    return apiErrorResponse(error, "Office expenses GET");
  }
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, body) => {
    try {
      const expense = await createOfficeExpense(orgId, body);
      return NextResponse.json(expense);
    } catch (error) {
      return apiErrorResponse(error, "Office expenses POST");
    }
  },
  { schema: createOfficeExpenseSchema },
);
