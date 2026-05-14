/** קישור PayPal.Me עם סכום (גבייה מלקוחות) */
export function paypalMeUrlWithAmount(slug: string, amount: number): string {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const a = Math.max(0, Math.round(amount * 100) / 100);
  return `https://www.paypal.com/paypalme/${encodeURIComponent(clean)}/${a}`;
}
