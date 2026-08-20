import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * קודי-קישור חד-פעמיים לחיבור מספר WhatsApp לארגון. נשמרים בטבלת Setting
 * (key=`wa_link_code:<code>`) כדי לא להוסיף טבלה — נפח נמוך וקצר-טווח.
 */
const PREFIX = "wa_link_code:";
const TTL_MS = 15 * 60 * 1000; // 15 דקות

export type WhatsappLinkCodePayload = {
  organizationId: string;
  userId: string;
  expiresAt: number;
};

export function whatsappLinkCodeKey(code: string): string {
  return `${PREFIX}${code}`;
}

/** מפיק קוד 6-ספרתי חדש ומאחסן אותו. */
export async function generateWhatsappLinkCode(
  organizationId: string,
  userId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const payload: WhatsappLinkCodePayload = {
    organizationId,
    userId,
    expiresAt: expiresAt.getTime(),
  };
  await prisma.setting.upsert({
    where: { key: whatsappLinkCodeKey(code) },
    create: { key: whatsappLinkCodeKey(code), value: JSON.stringify(payload), group: "whatsapp" },
    update: { value: JSON.stringify(payload) },
  });
  return { code, expiresAt };
}

/** מזהה קוד 6-ספרתי בתוך טקסט חופשי (מתעלם מרווחים/מקפים). */
export function extractLinkCode(text: string): string | null {
  const digits = text.replace(/[\s-]/g, "");
  const m = digits.match(/\b(\d{6})\b/) ?? (/^\d{6}$/.test(digits) ? [digits, digits] : null);
  return m ? m[1]! : null;
}

/** צורך קוד: מחזיר את ה-payload אם תקף ולא פג, ומוחק אותו (חד-פעמי). */
export async function consumeWhatsappLinkCode(
  code: string,
): Promise<WhatsappLinkCodePayload | null> {
  const key = whatsappLinkCodeKey(code);
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  await prisma.setting.delete({ where: { key } }).catch(() => {});
  try {
    const payload = JSON.parse(row.value) as WhatsappLinkCodePayload;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
