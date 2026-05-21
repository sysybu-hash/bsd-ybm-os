import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { getWebAuthnOrigin, getWebAuthnRpId, getWebAuthnRpName } from "@/lib/auth/passkey-config";

const challengeStore = new Map<string, { challenge: string; userId?: string; expires: number }>();

function storeChallenge(key: string, challenge: string, userId?: string) {
  challengeStore.set(key, { challenge, userId, expires: Date.now() + 5 * 60_000 });
}

function takeChallenge(key: string): { challenge: string; userId?: string } | null {
  const row = challengeStore.get(key);
  challengeStore.delete(key);
  if (!row || row.expires < Date.now()) return null;
  return { challenge: row.challenge, userId: row.userId };
}

export async function createPasskeyRegistrationOptions(userId: string, email: string) {
  const existing = await prisma.userPasskey.findMany({
    where: { userId },
    select: { credentialId: true },
  });
  const options = await generateRegistrationOptions({
    rpName: getWebAuthnRpName(),
    rpID: getWebAuthnRpId(),
    userName: email,
    userID: new TextEncoder().encode(userId),
    userDisplayName: email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: ["internal", "hybrid"],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });
  storeChallenge(`reg:${userId}`, options.challenge, userId);
  return options;
}

export async function verifyPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  deviceName?: string,
) {
  const stored = takeChallenge(`reg:${userId}`);
  if (!stored || stored.userId !== userId) {
    throw new Error("challenge_expired");
  }
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("verification_failed");
  }
  const { credential } = verification.registrationInfo;
  await prisma.userPasskey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceName: deviceName?.trim() || null,
    },
  });
  return true;
}

export async function createPasskeyAuthenticationOptions(email?: string) {
  let allowCredentials: { id: string; transports?: ("internal" | "hybrid" | "usb" | "nfc" | "ble")[] }[] | undefined;
  if (email) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
      select: { id: true, passkeys: { select: { credentialId: true } } },
    });
    if (user?.passkeys.length) {
      allowCredentials = user.passkeys.map((p) => ({
        id: p.credentialId,
        transports: ["internal", "hybrid"],
      }));
    }
  }
  const options = await generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    allowCredentials,
    userVerification: "preferred",
  });
  const key = email ? `auth:${email.toLowerCase()}` : "auth:discoverable";
  storeChallenge(key, options.challenge);
  return { options, challengeKey: key };
}

export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  challengeKey: string,
) {
  const stored = takeChallenge(challengeKey);
  if (!stored) throw new Error("challenge_expired");

  const credId = response.id;
  const passkey = await prisma.userPasskey.findUnique({
    where: { credentialId: credId },
    include: { user: { select: { id: true, email: true, accountStatus: true } } },
  });
  if (!passkey?.user) throw new Error("unknown_credential");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
    },
  });
  if (!verification.verified) throw new Error("verification_failed");

  await prisma.userPasskey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });

  return passkey.user;
}
