/**
 * PayPal REST API (Orders v2) — שרת בלבד. דורש PAYPAL_CLIENT_SECRET + מזהה לקוח.
 */
function paypalBaseUrl(): string {
  const mode = process.env.PAYPAL_ENV?.trim().toLowerCase();
  if (mode === "sandbox") return "https://api-m.sandbox.paypal.com";
  return "https://api-m.paypal.com";
}

export function getPayPalClientId(): string {
  return (
    process.env.PAYPAL_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ||
    ""
  );
}

function getPayPalSecret(): string {
  return process.env.PAYPAL_CLIENT_SECRET?.trim() || "";
}

export function isPayPalServerConfigured(): boolean {
  return Boolean(getPayPalClientId() && getPayPalSecret());
}

export async function paypalGetAccessToken(): Promise<string> {
  const id = getPayPalClientId();
  const secret = getPayPalSecret();
  if (!id || !secret) {
    throw new Error("PayPal: חסר PAYPAL_CLIENT_SECRET או מזהה לקוח");
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const j = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || `PayPal token HTTP ${res.status}`);
  }
  return j.access_token;
}

export async function paypalCreateOrderBody(params: {
  amountValue: string;
  description: string;
  customId: string;
}): Promise<{ id: string }> {
  const token = await paypalGetAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "ILS",
            value: params.amountValue,
          },
          description: params.description,
          custom_id: params.customId,
        },
      ],
    }),
  });
  const j = (await res.json()) as { id?: string; message?: string; details?: unknown };
  if (!res.ok || !j.id) {
    console.error("[PayPal create order]", j);
    throw new Error(j.message || `PayPal create order ${res.status}`);
  }
  return { id: j.id };
}

export async function paypalCaptureOrder(orderId: string): Promise<Record<string, unknown>> {
  const token = await paypalGetAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[PayPal capture]", j);
    throw new Error(typeof j.message === "string" ? j.message : `PayPal capture ${res.status}`);
  }
  return j;
}

export async function paypalFetchOrder(orderId: string): Promise<Record<string, unknown>> {
  const token = await paypalGetAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[PayPal get order]", j);
    throw new Error(typeof j.message === "string" ? j.message : `PayPal get order ${res.status}`);
  }
  return j;
}

/**
 * אימות חתימת webhook לפי PayPal — דורש PAYPAL_WEBHOOK_ID (ממסך הפיתוח של Webhooks).
 * https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post
 */
export async function verifyPayPalWebhookSignature(params: {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  body: string;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    console.error("[PayPal webhook] חסר PAYPAL_WEBHOOK_ID — דוחים אירוע");
    return false;
  }
  try {
    const token = await paypalGetAccessToken();
    const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transmission_id: params.transmissionId,
        transmission_time: params.transmissionTime,
        cert_url: params.certUrl,
        auth_algo: params.authAlgo,
        transmission_sig: params.transmissionSig,
        webhook_id: webhookId,
        webhook_event_body: params.body,
      }),
    });
    const j = (await res.json()) as { verification_status?: string };
    return res.ok && j.verification_status === "SUCCESS";
  } catch (e) {
    console.error("[PayPal webhook] verify", e);
    return false;
  }
}
