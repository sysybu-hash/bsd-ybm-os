/**
 * פענוח תשובת Orders v2 אחרי capture — custom_id, סכום, מזהה capture.
 */
export function parseCapturePayload(data: Record<string, unknown>): {
  customId: string;
  paid: number;
  currency: string;
  captureStatus: string;
  captureId: string;
} | null {
  const orderStatus = String(data.status || "");
  const units = data.purchase_units as unknown[] | undefined;
  const u0 = units?.[0] as Record<string, unknown> | undefined;
  if (!u0 || orderStatus !== "COMPLETED") return null;
  const payments = u0.payments as Record<string, unknown> | undefined;
  const captures = payments?.captures as unknown[] | undefined;
  const cap0 = captures?.[0] as Record<string, unknown> | undefined;
  // A GET on the order carries custom_id on the purchase unit, but the response
  // returned by the capture call does not — there it only appears on the capture
  // itself. Reading just the purchase unit silently loses the tier for a payment
  // that actually succeeded.
  const customId = String(u0.custom_id || cap0?.custom_id || "");
  const amount = cap0?.amount as Record<string, unknown> | undefined;
  const value = amount?.value != null ? parseFloat(String(amount.value)) : NaN;
  const currency = String(amount?.currency_code || "");
  const capStatus = String(cap0?.status || "");
  const captureId = String(cap0?.id || "");
  if (!customId || !Number.isFinite(value) || capStatus !== "COMPLETED" || !captureId) return null;
  return { customId, paid: value, currency, captureStatus: capStatus, captureId };
}
