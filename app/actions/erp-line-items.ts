"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateRowSchema = z
  .object({
    id: z.string().min(1),
    unitPrice: z.number().positive().optional(),
    lineTotal: z.number().positive().optional(),
  })
  .refine((row) => row.unitPrice != null || row.lineTotal != null, {
    message: "נדרש unitPrice או lineTotal",
  });

const resolvePriceAlertsSchema = z.object({
  updates: z.array(updateRowSchema).min(1),
});

export type ResolvePriceAlertLineItemInput = z.infer<typeof resolvePriceAlertsSchema>;

/**
 * עדכון מחיר יחידה לשורות עם priceAlertPending — מחשב lineTotal, מנקה דגל,
 * ורושם ProductPriceObservation ללמידת מחירים בסריקות עתידיות.
 */
export async function resolvePriceAlertLineItemsAction(
  input: ResolvePriceAlertLineItemInput,
): Promise<{ ok: true; cleared: number } | { ok: false; error: string }> {
  const parsed = resolvePriceAlertsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "נתונים לא תקינים" };
  }

  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) {
    return { ok: false, error: "לא מורשה" };
  }

  const uniqueById = new Map<string, { unitPrice?: number; lineTotal?: number }>();
  for (const u of parsed.data.updates) {
    uniqueById.set(u.id, { unitPrice: u.unitPrice, lineTotal: u.lineTotal });
  }

  try {
    const cleared = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const [lineId, payload] of uniqueById) {
        const line = await tx.documentLineItem.findFirst({
          where: {
            id: lineId,
            organizationId: orgId,
            priceAlertPending: true,
          },
        });
        if (!line) {
          throw new Error("שורה לא נמצאה או שכבר טופלה");
        }

        const q = line.quantity != null && line.quantity > 0 ? line.quantity : null;
        let unitPrice: number;
        let lineTotal: number;
        if (payload.unitPrice != null) {
          unitPrice = payload.unitPrice;
          lineTotal = q != null ? unitPrice * q : unitPrice;
        } else if (payload.lineTotal != null) {
          lineTotal = payload.lineTotal;
          unitPrice = q != null && q > 0 ? lineTotal / q : lineTotal;
        } else {
          throw new Error("חסר מחיר לשורה");
        }

        await tx.documentLineItem.update({
          where: { id: line.id },
          data: {
            unitPrice,
            lineTotal,
            priceAlertPending: false,
          },
        });

        await tx.productPriceObservation.create({
          data: {
            organizationId: orgId,
            documentId: line.documentId,
            normalizedKey: line.normalizedKey,
            description: line.description,
            supplierName: line.supplierName,
            unitPrice,
          },
        });
        n += 1;
      }
      return n;
    });

    revalidatePath("/app/documents/erp");
    revalidatePath("/app/business");
    return { ok: true, cleared };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "עדכון נכשל";
    return { ok: false, error: msg };
  }
}
