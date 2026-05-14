import { prisma } from "@/lib/prisma";

const PAYPLUS_API_URL = "https://restapi.payplus.co.il/api/v1.0";

function getPayPlusKey(): string {
  return process.env.PAYPLUS_API_KEY?.trim() || "";
}

function getPayPlusSecret(): string {
  return process.env.PAYPLUS_SECRET_KEY?.trim() || "";
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
  metadata?: any;
}) {
  const apiKey = getPayPlusKey();
  const secretKey = getPayPlusSecret();

  if (!apiKey || !secretKey) {
    throw new Error("PayPlus: חסר API_KEY או SECRET_KEY");
  }

  const body = {
    payment_page_uid: process.env.PAYPLUS_PAYMENT_PAGE_UID, // Defined in PayPlus dashboard
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

  return data.data.payment_page_link;
}

/**
 * Validates the PayPlus IPN/Webhook request.
 * PayPlus usually sends a POST with transaction details.
 */
export async function processPayPlusWebhook(payload: any) {
  const { transaction, more_info } = payload;
  
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
        payplusTransactionId: transaction.uid,
        lastWebhookPayload: payload
      }
    });
    return { success: true };
  }

  return { success: false, message: "Missing metadata" };
}
