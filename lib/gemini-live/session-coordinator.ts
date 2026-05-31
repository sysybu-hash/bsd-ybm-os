export type GeminiLiveOwner =
  | "omnibar"
  | "aiChatFull"
  | "fieldCopilot"
  | "marketingOmnibar"
  | "appBuilder";

type Lease = {
  owner: GeminiLiveOwner;
  leaseId: string;
  stopPeer: () => void;
};

let activeLease: Lease | null = null;

export function acquireGeminiLiveLease(
  owner: GeminiLiveOwner,
  stopPeer: () => void,
): string {
  const leaseId = `${owner}-${Date.now()}`;
  if (activeLease && activeLease.owner !== owner) {
    try {
      activeLease.stopPeer();
    } catch {
      /* ignore */
    }
  }
  activeLease = { owner, leaseId, stopPeer };
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("gemini-live:owner-changed", { detail: { owner, leaseId } }),
    );
  }
  return leaseId;
}

export function releaseGeminiLiveLease(leaseId: string): void {
  if (!activeLease || activeLease.leaseId !== leaseId) return;
  activeLease = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("gemini-live:owner-changed", { detail: { owner: null, leaseId } }),
    );
  }
}

export function getGeminiLiveOwner(): GeminiLiveOwner | null {
  return activeLease?.owner ?? null;
}

export function isGeminiLiveOwnedBy(owner: GeminiLiveOwner): boolean {
  return activeLease?.owner === owner;
}
