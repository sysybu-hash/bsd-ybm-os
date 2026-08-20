import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("payplus");

const PAYPLUS_API_URL = "https://restapi.payplus.co.il/api/v1.0";

export type PayPlusPaymentPageResult = {
  url: string;
  paymentPageUid?: string;
};

export type PayPlusRefundResult = {
  success: boolean;
  refundId: string | null;
  message: string;
};

function getPayPlusKey(): string {
  return env.PAYPLUS_API_KEY?.trim() || "";
}

function getPayPlusSecret(): string {
  return env.PAYPLUS_SECRET_KEY?.trim() || "";
}

export function isPayPlusConfigured(): boolean {
  return Boolean(getPayPlusKey() && getPayPlusSecret());
}

/**
 * Creates a payment page request in PayPlus and returns the checkout URL.
 */
export async function createPayPlusPaymentPage(params: {
  amount: number;
  currencyCode?: string;
  itemName: string;
  customerName: string;
  customerEmail: string;
  successUrl: string;
  errorUrl: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PayPlusPaymentPageResult> {
  const apiKey = getPayPlusKey();
  const secretKey = getPayPlusSecret();

  if (!apiKey || !secretKey) {
    throw new Error("PayPlus: חסר API_KEY או SECRET_KEY");
  }

  const body = {
    payment_page_uid: env.PAYPLUS_PAYMENT_PAGE_UID, // Defined in PayPlus dashboard
    amount: params.amount,
    currency_code: params.currencyCode || "ILS",
    items: [
      {
        name: params.itemName,
        quantity: 1,
        price: params.amount
      }
    ],
    customer: {
      name: params.customerName,
      email: params.customerEmail
    },
    more_info: JSON.stringify(params.metadata || {}),
    urls: {
      success: params.successUrl,
      error: params.errorUrl,
      callback: params.callbackUrl
    }
  };

  const response = await fetch(`${PAYPLUS_API_URL}/payment-pages/generate-link`, {
    method: "POST",
    headers: {
      "Authorization": JSON.stringify({ api_key: apiKey, secret_key: secretKey }),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok || !data.data?.payment_page_link) {
    throw new Error(data.message || `PayPlus Error: ${response.status}`);
  }

  return {
    url: data.data.payment_page_link as string,
    paymentPageUid:
      typeof data.data.payment_page_uid === "string" ? data.data.payment_page_uid : undefined,
  };
}

/**
 * Refund a PayPlus transaction by UID.
 * https://docs.payplus.co.il/reference/post_transactions-refundbytransactionuid
 */
export async function refundPayPlusByTransactionUid(params: {
  transactionUid: string;
  amount?: number;
  moreInfo?: string;
}): Promise<PayPlusRefundResult> {
  const apiKey = getPayPlusKey();
  const secretKey = getPayPlusSecret();

  if (!apiKey || !secretKey) {
    return {
      success: false,
      refundId: null,
      message: "PayPlus not configured — set PAYPLUS_API_KEY and PAYPLUS_SECRET_KEY",
    };
  }

  const transactionUid = params.transactionUid.trim();
  if (!transactionUid) {
    return { success: false, refundId: null, message: "Missing transaction UID" };
  }

  if (params.amount == null || !Number.isFinite(params.amount)) {
    return {
      success: false,
      refundId: null,
      message: "PayPlus refund requires an explicit amount",
    };
  }

  const body: Record<string, unknown> = {
    transaction_uid: transactionUid,
    amount: params.amount,
  };
  if (params.moreInfo?.trim()) {
    body.more_info = params.moreInfo.trim();
  }

  try {
    const response = await fetch(`${PAYPLUS_API_URL}/Transactions/RefundByTransactionUID`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "secret-key": secretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as {
      results?: { status?: string; description?: string };
      data?: { transaction?: { uid?: string } };
      message?: string;
    };

    if (!response.ok) {
      const message = data.results?.description ?? data.message ?? `PayPlus refund HTTP ${response.status}`;
      log.error("payplus_refund_failed", undefined, { status: response.status, data });
      return { success: false, refundId: null, message };
    }

    const status = data.results?.status ?? "";
    const refundId = data.data?.transaction?.uid ?? null;
    if (status === "success" && refundId) {
      return { success: true, refundId, message: data.results?.description ?? "Refund completed" };
    }

    return {
      success: false,
      refundId,
      message: data.results?.description ?? data.message ?? "PayPlus refund failed",
    };
  } catch (e) {
    log.error("payplus_refund_error", e instanceof Error ? e : new Error(String(e)));
    return {
      success: false,
      refundId: null,
      message: e instanceof Error ? e.message : "PayPlus refund request failed",
    };
  }
}

/**
 * Validates the PayPlus IPN/Webhook request.
 * PayPlus usually sends a POST with transaction details.
 */
export async function processPayPlusWebhook(payload: Record<string, unknown>) {
  const transaction = payload.transaction as
    | { status?: string; uid?: string; transaction_uid?: string; amount?: number }
    | undefined;
  const more_info = payload.more_info as string | undefined;
  
  if (!transaction || transaction.status !== "success") {
    return { success: false, message: "Transaction failed or invalid" };
  }

  const metadata = JSON.parse(more_info || "{}");
  const organizationId = metadata.organizationId;
  const invoiceId = metadata.invoiceId;

  if (organizationId && invoiceId) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        payplusTransactionId: transaction.uid ?? transaction.transaction_uid,
        lastWebhookPayload: payload as unknown as import("@prisma/client").Prisma.InputJsonValue
      }
    });
    return { success: true };
  }

  return { success: false, message: "Missing metadata" };
}
