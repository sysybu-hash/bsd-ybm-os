import type { UserRole } from "@prisma/client";
import type { Session } from "next-auth";

/** ערכי ברירת מחדל לבדיקות API עם ארגון */
const defaultWorkspaceSession = (): Session => ({
  expires: new Date(Date.now() + 86_400_000).toISOString(),
  user: {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    role: "EMPLOYEE",
    organizationId: "test-org-id",
  },
});

/**
 * בונה אובייקט Session לבדיקות (מיזוג עם ברירות מחדל).
 * דורש `jest.mock("next-auth")` ו־`getServerSession` כ־`jest.fn()`.
 */
export function buildWorkspaceSession(
  overrides?: Partial<Session["user"]> & { role?: UserRole },
): Session {
  const base = defaultWorkspaceSession();
  return {
    ...base,
    user: {
      ...base.user,
      ...overrides,
      role: (overrides?.role ?? base.user.role) as string,
    },
  };
}

/**
 * מחזיר Session ללא ארגון (בדיקות 401).
 */
export function buildSessionWithoutOrg(userId = "test-user-id"): Session {
  const s = defaultWorkspaceSession();
  return {
    ...s,
    user: { ...s.user, id: userId, organizationId: null },
  };
}

/**
 * קובע מה `getServerSession` יחזיר בבדיקה הבאה.
 * דוגמה:
 * ```ts
 * jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
 * import { getServerSession } from "next-auth";
 * import { mockGetServerSession } from "@/lib/test-utils";
 * mockGetServerSession(buildWorkspaceSession());
 * ```
 */
export function mockGetServerSession(session: Session | null) {
  const { getServerSession } = require("next-auth") as {
    getServerSession: jest.MockedFunction<typeof import("next-auth").getServerSession>;
  };
  getServerSession.mockResolvedValue(session);
}

/** Request עם גוף JSON (POST/PATCH) */
export function createJsonRequest(
  url: string,
  body: unknown,
  init?: Omit<RequestInit, "body" | "method"> & { method?: string },
): Request {
  return new Request(url, {
    method: init?.method ?? "POST",
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: JSON.stringify(body),
  });
}

/** קריאת תשובת JSON מ־NextResponse בבדיקות (כש־NextResponse ממוקא) */
export async function readJsonResponse<T = unknown>(res: {
  status: number;
  json: () => Promise<T>;
}): Promise<{ status: number; body: T }> {
  const body = await res.json();
  return { status: res.status, body };
}
