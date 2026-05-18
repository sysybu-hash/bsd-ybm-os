import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? "";
  /** WebSocket driver — רק פיתוח מקומי ב-Windows (עוקף P1001 / IPv6). ב-Vercel משתמשים ב-TCP רגיל. */
  const useNeonDriver =
    /neon\.tech/i.test(connectionString) &&
    process.env.PRISMA_USE_NEON_DRIVER !== "0" &&
    process.platform === "win32";

  if (useNeonDriver) {
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const adapter = new PrismaNeon({ connectionString });
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
