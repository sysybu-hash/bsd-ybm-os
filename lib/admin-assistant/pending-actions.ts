import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const TTL_MS = 10 * 60 * 1000;

export type PendingActionType = "subscription_update" | "broadcast";

export type PendingActionPayload =
  | {
      type: "subscription_update";
      organizationId: string;
      tier: string;
      subscriptionStatus: string;
    }
  | {
      type: "broadcast";
      title: string;
      body: string;
    };

type StoredAction = PendingActionPayload & {
  expiresAt: number;
  createdBy: string;
};

const store = new Map<string, StoredAction>();

function signingSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "dev-admin-pending-actions"
  );
}

function sign(id: string): string {
  return createHmac("sha256", signingSecret()).update(id).digest("hex").slice(0, 16);
}

export type PendingActionPublic = {
  actionId: string;
  token: string;
  type: PendingActionType;
  summary: string;
  payload: PendingActionPayload;
};

let requestPending: PendingActionPublic[] = [];
let currentAdminEmail = "";

export function setAdminAssistantRequestEmail(email: string): void {
  currentAdminEmail = email.trim().toLowerCase();
}

export function getAdminAssistantRequestEmail(): string {
  return currentAdminEmail;
}

export function resetRequestPendingActions(): void {
  requestPending = [];
}

export function takeRequestPendingActions(): PendingActionPublic[] {
  const items = requestPending;
  requestPending = [];
  return items;
}

export function createPendingAction(
  payload: PendingActionPayload,
  createdBy: string,
): PendingActionPublic {
  const id = randomBytes(12).toString("hex");
  const token = sign(id);
  store.set(`${id}:${token}`, {
    ...payload,
    expiresAt: Date.now() + TTL_MS,
    createdBy,
  });

  const summary =
    payload.type === "broadcast"
      ? `שידור: "${payload.title}"`
      : `עדכון מנוי: ארגון ${payload.organizationId} → ${payload.tier} (${payload.subscriptionStatus})`;

  const publicItem: PendingActionPublic = {
    actionId: id,
    token,
    type: payload.type,
    summary,
    payload,
  };
  requestPending.push(publicItem);
  return publicItem;
}

export function consumePendingAction(
  actionId: string,
  token: string,
  adminEmail: string,
): PendingActionPayload | null {
  const expected = sign(actionId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const key = `${actionId}:${token}`;
  const stored = store.get(key);
  if (!stored || stored.expiresAt < Date.now() || stored.createdBy !== adminEmail) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  const { expiresAt: _e, createdBy: _c, ...payload } = stored;
  return payload;
}
