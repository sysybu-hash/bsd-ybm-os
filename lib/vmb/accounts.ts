import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import type { GoogleIdClaims } from "@/lib/validation/schemas/vmb-auth";

/** VisualModuBuild accounts: separate from the platform's users. */

export type AccountResult = { ok: true; userId: string } | { ok: false; code: "invalid" | "exists" | "weak" };

// A fixed hash so a missing account costs the same time as a wrong password.
const DUMMY_HASH = "$2b$12$8u.jOQ.mLL91W915To8SwOHwpfRxl1iPuS/sVuabVo0v.uRKpftq.";

export async function registerWithPassword(input: { email: string; password: string; name?: string }): Promise<AccountResult> {
  if (!validatePasswordStrength(input.password).ok) return { ok: false, code: "weak" };
  const existing = await prisma.vmbUser.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) return { ok: false, code: "exists" };
  const hash = await hashPassword(input.password);
  const user = await prisma.vmbUser.create({
    data: { email: input.email, name: input.name ?? null, lastLoginAt: new Date(), password: { create: { hash } } },
    select: { id: true },
  });
  return { ok: true, userId: user.id };
}

export async function loginWithPassword(email: string, password: string): Promise<AccountResult> {
  const user = await prisma.vmbUser.findUnique({
    where: { email },
    select: { id: true, password: { select: { hash: true } } },
  });
  const ok = await verifyPassword(password, user?.password?.hash ?? DUMMY_HASH);
  if (!user || !user.password || !ok) return { ok: false, code: "invalid" };
  await prisma.vmbUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, userId: user.id };
}

/**
 * Google sign-in: find by Google subject, else by email, else create.
 * An unverified account with the same email (password sign-up nobody proved)
 * loses its password when Google vouches for the address, so a squatter who
 * registered someone else's email cannot keep a way in.
 */
export async function upsertGoogleUser(claims: GoogleIdClaims): Promise<string> {
  const email = claims.email.trim().toLowerCase();
  const bySub = await prisma.vmbUser.findUnique({ where: { googleSub: claims.sub }, select: { id: true } });
  if (bySub) {
    await prisma.vmbUser.update({
      where: { id: bySub.id },
      data: { lastLoginAt: new Date(), image: claims.picture ?? undefined },
    });
    return bySub.id;
  }
  const byEmail = await prisma.vmbUser.findUnique({ where: { email }, select: { id: true, emailVerified: true, name: true } });
  if (byEmail) {
    await prisma.$transaction([
      ...(byEmail.emailVerified ? [] : [prisma.vmbPasswordCredential.deleteMany({ where: { userId: byEmail.id } })]),
      ...(byEmail.emailVerified ? [] : [prisma.vmbSession.deleteMany({ where: { userId: byEmail.id } })]),
      prisma.vmbUser.update({
        where: { id: byEmail.id },
        data: {
          googleSub: claims.sub,
          emailVerified: true,
          lastLoginAt: new Date(),
          name: byEmail.name ?? claims.name ?? null,
          image: claims.picture ?? undefined,
        },
      }),
    ]);
    return byEmail.id;
  }
  const created = await prisma.vmbUser.create({
    data: {
      email,
      googleSub: claims.sub,
      emailVerified: true,
      name: claims.name ?? null,
      image: claims.picture ?? null,
      lastLoginAt: new Date(),
    },
    select: { id: true },
  });
  return created.id;
}
