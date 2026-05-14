import { prisma } from "./prisma";

/**
 * מנהל הגבלת קצב (Rate Limiting) מבוסס בסיס נתונים לשימוש ב-Serverless.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  
  // מציאת הרשומה או יצירתה
  const rateLimit = await prisma.rateLimit.upsert({
    where: { key },
    update: {},
    create: {
      key,
      count: 0,
      resetAt: new Date(now.getTime() + windowMs),
    },
  });

  // אם עבר הזמן — לאפס
  if (now > rateLimit.resetAt) {
    const updated = await prisma.rateLimit.update({
      where: { key },
      data: {
        count: 1,
        resetAt: new Date(now.getTime() + windowMs),
      },
    });
    return { success: true, remaining: limit - 1, resetAt: updated.resetAt };
  }

  // אם חרג מהמכסה
  if (rateLimit.count >= limit) {
    return { success: false, remaining: 0, resetAt: rateLimit.resetAt };
  }

  // עדכון מונה
  const updated = await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return { 
    success: true, 
    remaining: limit - updated.count, 
    resetAt: updated.resetAt 
  };
}
