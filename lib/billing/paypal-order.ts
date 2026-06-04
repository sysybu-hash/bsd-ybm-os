import "@/lib/payments/register-gateways";
import { getGateway } from "@/lib/payments/gateway-interface";
import { payPalGateway } from "@/lib/payments/paypal-gateway";
import { isPayPalServerConfigured } from "@/lib/paypal-server";

export async function createPayPalOrderId(params: {
  amountValue: string;
  description: string;
  customId: string;
}): Promise<string> {
  if (!isPayPalServerConfigured()) {
    throw new Error("PayPal לא מוגדר בשרת");
  }
  const gateway = getGateway("paypal");
  const result = await gateway.createCheckout({
    amount: parseFloat(params.amountValue),
    currencyCode: "ILS",
    itemName: params.description,
    customerName: "BSD-YBM",
    customerEmail: "billing@bsd-ybm.co.il",
    successUrl: "https://bsd-ybm.co.il/app/settings/billing",
    errorUrl: "https://bsd-ybm.co.il/app/settings/billing",
    callbackUrl: "https://bsd-ybm.co.il/api/webhooks/paypal",
    idempotencyKey: params.customId,
  });
  return result.providerRef;
}

export async function capturePayPalOrder(orderId: string): Promise<Record<string, unknown>> {
  if (!isPayPalServerConfigured()) {
    throw new Error("PayPal לא מוגדר בשרת");
  }
  return payPalGateway.captureOrder(orderId);
}
