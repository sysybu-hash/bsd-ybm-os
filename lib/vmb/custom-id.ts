import { findCreditPack } from "@/lib/vmb/plans";

/**
 * Purchases are tagged on the gateway order as custom_id:
 *   VMB|{workspaceId}|ANNUAL
 *   VMB|{workspaceId}|CREDITS|{packId}
 * The platform's PayPal webhook routes anything starting with "VMB|" to VMB.
 */
export type VmbPurchase = { workspaceId: string; kind: "annual" } | { workspaceId: string; kind: "credits"; packId: string };

export const VMB_CUSTOM_ID_PREFIX = "VMB|";

export function vmbCustomId(p: VmbPurchase): string {
  return p.kind === "annual" ? `VMB|${p.workspaceId}|ANNUAL` : `VMB|${p.workspaceId}|CREDITS|${p.packId}`;
}

export function parseVmbCustomId(raw: string | null | undefined): VmbPurchase | null {
  const parts = (raw ?? "").split("|");
  if (parts[0] !== "VMB" || !parts[1] || !/^[a-z0-9]{10,40}$/i.test(parts[1])) return null;
  if (parts.length === 3 && parts[2] === "ANNUAL") return { workspaceId: parts[1], kind: "annual" };
  if (parts.length === 4 && parts[2] === "CREDITS" && parts[3] && findCreditPack(parts[3])) {
    return { workspaceId: parts[1], kind: "credits", packId: parts[3] };
  }
  return null;
}
