import { env } from "@/lib/env";

export function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    env.VAPID_SUBJECT?.trim() ||
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "mailto:support@bsd-ybm.co.il";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY?.trim() ?? env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? null;
}
