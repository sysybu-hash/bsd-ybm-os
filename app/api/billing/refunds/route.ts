import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonBadGateway,
  jsonBadRequest,
  jsonNotFound,
  jsonServiceUnavailable,
} from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { billingAuditDetails, logBillingAudit } from "@/lib/billing/billing-audit";
import "@/lib/payments/register-gateways";
import { getGateway } from "@/lib/payments/gateway-interface";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("billing-refunds");

const refundBodySchema = z.object({
  gateway: z.enum(["paypal", "payplus", "stripe"]),
  transactionId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().max(255).optional(),
  invoiceId: z.string().optional(),
});

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId }, data) => {
    try {
      const gatewayName = data.gateway;
      const gateway = getGateway(gatewayName);

      if (!gateway.isConfigured()) {
        return jsonServiceUnavailable(
          `${gatewayName} לא מוגדר בשרת`,
          `${gatewayName}_not_configured`,
        );
      }

      const transactionId = data.transactionId.trim();

      let invoice = data.invoiceId
        ? await prisma.invoice.findFirst({
            where: { id: data.invoiceId, organizationId: orgId },
          })
        : await prisma.invoice.findFirst({
            where: { organizationId: orgId, payplusTransactionId: transactionId },
          });

      if (data.invoiceId && !invoice) {
        return jsonNotFound("חשבונית לא נמצאה בארגון", "invoice_not_found");
      }

      if (invoice && invoice.payplusTransactionId && invoice.payplusTransactionId !== transactionId) {
        return jsonBadRequest("מזהה עסקה לא תואם לחשבונית", "transaction_mismatch");
      }

      const result = await gateway.refund({
        transactionId,
        amount: data.amount,
        reason: data.reason,
      });

      if (!result.success) {
        log.warn("refund_failed", { gateway: gatewayName, transactionId, message: result.message });
        return jsonBadGateway(result.message, "refund_failed");
      }

      if (invoice) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: "REFUNDED" },
        });
      }

      await logBillingAudit(
        userId,
        orgId,
        "refund",
        billingAuditDetails({
          gateway: gatewayName,
          transactionId,
          refundId: result.refundId,
          amount: data.amount ?? invoice?.amount ?? null,
          invoiceId: invoice?.id ?? null,
        }),
      );

      return NextResponse.json({
        success: true,
        refundId: result.refundId,
        message: result.message,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "[billing/refunds]");
    }
  },
  { schema: refundBodySchema, allowedRoles: ["ORG_ADMIN", "SUPER_ADMIN"] },
);
