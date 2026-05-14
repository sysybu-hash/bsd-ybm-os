import { CompanyType, DocStatus, DocType, type SubscriptionTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VAT_RATE } from "@/lib/billing-calculations";
import { getExpectedTierOrderAmountIls } from "@/lib/billing-pricing";
import { tierLabelHe, defaultScanBalancesForTier, parseSubscriptionTier } from "@/lib/subscription-tier-config";

export type ApplyPayPalCaptureOk =
  | { ok: true; duplicate: true }
  | {
      ok: true;
      duplicate: false;
      planLabel: string;
      orgName: string;
      notifyEmail: string | null;
      paidTotal: number;
    };

export type ApplyPayPalCaptureErr = { ok: false; status: number; error: string };

/**
 * מיישם תשלום PayPal שהושלם (אחרי capture) — מנוי / חבילת סריקות, מסמך מס, רשומת Invoice לאידמפוטנטיות.
 * נקרא מ־capture-order (אחרי אימות סשן) ומ־webhook PAYMENT.CAPTURE.COMPLETED.
 */
export async function applyPayPalCaptureResult(params: {
  customIdFull: string;
  paidTotal: number;
  currency: string;
  captureId: string;
  /** כשמגיע מ־capture-order — חובה שיתאים ל־orgId שב־custom_id */
  sessionOrgId?: string;
}): Promise<ApplyPayPalCaptureOk | ApplyPayPalCaptureErr> {
  const { customIdFull, paidTotal, currency, captureId, sessionOrgId } = params;

  if (currency !== "ILS") {
    return { ok: false, status: 400, error: "מטבע לא צפוי" };
  }

  const existing = await prisma.invoice.findUnique({
    where: { payplusTransactionId: captureId },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, duplicate: true };
  }

  const parts = customIdFull.split("|");
  const orgIdFromOrder = parts[0]?.trim();
  const kind = parts[1]?.trim().toUpperCase();
  const payload = parts[2]?.trim();

  if (!orgIdFromOrder || !kind || !payload) {
    return { ok: false, status: 400, error: "מזהה מותאם אישית (custom_id) לא תקין" };
  }

  if (sessionOrgId && orgIdFromOrder !== sessionOrgId) {
    return { ok: false, status: 403, error: "ההזמנה לא תואמת לארגון" };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgIdFromOrder },
    select: {
      name: true,
      companyType: true,
      isReportable: true,
    },
  });
  if (!org) {
    return { ok: false, status: 404, error: "ארגון לא נמצא" };
  }

  const notifyUser = await prisma.user.findFirst({
    where: { organizationId: orgIdFromOrder },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  const notifyEmail = notifyUser?.email?.trim() || null;

  let amountNet = paidTotal;
  let vatAmt = 0;
  if (org.isReportable && org.companyType !== CompanyType.EXEMPT_DEALER) {
    amountNet = Math.round((paidTotal / (1 + VAT_RATE)) * 100) / 100;
    vatAmt = Math.round((paidTotal - amountNet) * 100) / 100;
  }

  const docType = org.isReportable ? DocType.INVOICE_RECEIPT : DocType.RECEIPT;

  let planLabel = "";
  let descriptionLine = "";

  try {
    if (kind === "BUNDLE") {
      const bundle = await prisma.scanBundle.findFirst({
        where: { id: payload, isActive: true },
      });
      if (!bundle) {
        return { ok: false, status: 400, error: "חבילה לא תואמת" };
      }
      if (Math.abs(paidTotal - bundle.priceIls) > 0.02) {
        return { ok: false, status: 400, error: "סכום לא תואם לחבילה" };
      }
      planLabel = bundle.name;
      descriptionLine = `חבילת סריקות BSD-YBM — ${bundle.name} (PayPal)`;

      await prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id: orgIdFromOrder },
          data: {
            cheapScansRemaining: { increment: bundle.cheapAdds },
            premiumScansRemaining: { increment: bundle.premiumAdds },
          },
        });

        const lastDoc = await tx.issuedDocument.findFirst({
          where: { organizationId: orgIdFromOrder, type: docType },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (lastDoc?.number ?? 1000) + 1;

        await tx.issuedDocument.create({
          data: {
            organizationId: orgIdFromOrder,
            type: docType,
            number: nextNumber,
            clientName: org.name,
            amount: amountNet,
            vat: vatAmt,
            total: paidTotal,
            status: DocStatus.PAID,
            items: [
              {
                desc: descriptionLine,
                qty: 1,
                price: amountNet,
              },
            ],
          },
        });

        await tx.invoice.create({
          data: {
            organizationId: orgIdFromOrder,
            status: "PAID",
            amount: paidTotal,
            currency: "ILS",
            description: descriptionLine,
            invoiceNumber: `PP-${captureId.slice(-10)}`,
            customerName: org.name,
            customerEmail: notifyEmail,
            payplusTransactionId: captureId,
            paidAt: new Date(),
          },
        });
      });
    } else if (kind === "TIER") {
      const tier = parseSubscriptionTier(payload) as SubscriptionTier | null;
      if (!tier || tier === "FREE") {
        return { ok: false, status: 400, error: "רמת מנוי לא חוקית" };
      }
      const cycleToken = (parts[3] ?? "").trim().toUpperCase();
      const billingCycle: "monthly" | "annual" = cycleToken === "A" ? "annual" : "monthly";
      const expected = await getExpectedTierOrderAmountIls(tier, billingCycle);
      if (expected == null || Math.abs(paidTotal - expected) > 0.02) {
        return { ok: false, status: 400, error: "סכום לא תואם לרמת המנוי" };
      }
      const balances = defaultScanBalancesForTier(tier);
      planLabel = tierLabelHe(tier);
      descriptionLine = `מנוי BSD-YBM — ${planLabel} (תשלום PayPal)`;

      await prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id: orgIdFromOrder },
          data: {
            subscriptionTier: tier,
            subscriptionStatus: "ACTIVE",
            cheapScansRemaining: balances.cheapScansRemaining,
            premiumScansRemaining: balances.premiumScansRemaining,
            maxCompanies: balances.maxCompanies,
          },
        });

        const lastDoc = await tx.issuedDocument.findFirst({
          where: { organizationId: orgIdFromOrder, type: docType },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (lastDoc?.number ?? 1000) + 1;

        await tx.issuedDocument.create({
          data: {
            organizationId: orgIdFromOrder,
            type: docType,
            number: nextNumber,
            clientName: org.name,
            amount: amountNet,
            vat: vatAmt,
            total: paidTotal,
            status: DocStatus.PAID,
            items: [
              {
                desc: descriptionLine,
                qty: 1,
                price: amountNet,
              },
            ],
          },
        });

        await tx.invoice.create({
          data: {
            organizationId: orgIdFromOrder,
            status: "PAID",
            amount: paidTotal,
            currency: "ILS",
            description: descriptionLine,
            invoiceNumber: `PP-${captureId.slice(-10)}`,
            customerName: org.name,
            customerEmail: notifyEmail,
            payplusTransactionId: captureId,
            paidAt: new Date(),
          },
        });
      });
    } else {
      return { ok: false, status: 400, error: "סוג הזמנה לא מוכר" };
    }
  } catch (e) {
    console.error("[applyPayPalCaptureResult]", e);
    return {
      ok: false,
      status: 500,
      error: "עדכון מסד נתונים נכשל — פנו לתמיכה עם מזהה PayPal",
    };
  }

  return {
    ok: true,
    duplicate: false,
    planLabel: planLabel || "רכישה",
    orgName: org.name,
    notifyEmail,
    paidTotal,
  };
}
