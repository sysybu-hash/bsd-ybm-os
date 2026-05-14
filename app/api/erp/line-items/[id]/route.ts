import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonNotFound } from "@/lib/api-json";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { LineItemSchema } from "@/lib/schemas/line-item";

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof LineItemSchema>(
  async (req, { orgId }, { params }, body) => {
    const { id } = await params;

    const row = await prisma.documentLineItem.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });

    if (!row) {
      return jsonNotFound("שורת מסמך לא נמצאה");
    }

    const updated = await prisma.documentLineItem.update({
      where: { id },
      data: {
        description: body.description,
        quantity: body.quantity,
        unitPrice: body.unitPrice,
        lineTotal: body.lineTotal,
        priceAlertPending: body.priceAlertPending,
      },
    });

    return NextResponse.json({ lineItem: updated });
  },
  { schema: LineItemSchema, parseTarget: "body" }
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(
  async (req, { orgId }, { params }) => {
    const { id } = await params;
    const row = await prisma.documentLineItem.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });

    if (!row) {
      return jsonNotFound("שורת מסמך לא נמצאה");
    }

    await prisma.documentLineItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }
);
