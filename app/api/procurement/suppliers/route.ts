import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  createSupplierSchema,
  type SupplierRow,
} from "@/lib/validation/schemas/procurement";

export const dynamic = "force-dynamic";

const log = createLogger("procurement-suppliers");

function mapSupplier(row: {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  paymentTerms: string | null;
}): SupplierRow {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    email: row.email,
    phone: row.phone,
    taxId: row.taxId,
    paymentTerms: row.paymentTerms,
  };
}

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req, "procurement:suppliers", 30, 60_000);
  if (limited) return limited;

  try {
    const suppliers = await prisma.supplier.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ suppliers: suppliers.map(mapSupplier) });
  } catch (err: unknown) {
    log.error("list suppliers failed", {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    });
    return apiErrorResponse(err, "procurement-suppliers-list");
  }
});

export const POST = withWorkspacesAuth(
  async (req, { orgId }, data) => {
    const limited = await applyRateLimit(req, "procurement:suppliers:create", 20, 60_000);
    if (limited) return limited;

    try {
      const email = data.email?.trim() ? data.email.trim() : null;
      const supplier = await prisma.supplier.create({
        data: {
          organizationId: orgId,
          name: data.name.trim(),
          contactPerson: data.contactPerson?.trim() || null,
          email,
          phone: data.phone?.trim() || null,
          taxId: data.taxId?.trim() || null,
          paymentTerms: data.paymentTerms?.trim() || null,
        },
      });
      return NextResponse.json({ supplier: mapSupplier(supplier) }, { status: 201 });
    } catch (err: unknown) {
      log.error("create supplier failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
      });
      return apiErrorResponse(err, "procurement-suppliers-create");
    }
  },
  { schema: createSupplierSchema },
);
