export const PO_STATUSES = ["DRAFT", "SENT", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<PoStatus, readonly PoStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["CANCELLED"],
  PARTIAL: ["CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

export function canTransitionPoStatus(from: string, to: PoStatus): boolean {
  if (!PO_STATUSES.includes(from as PoStatus)) return false;
  return ALLOWED_TRANSITIONS[from as PoStatus].includes(to);
}

export function computeOrderStatusAfterReceive(
  lines: ReadonlyArray<{ quantity: number; receivedQty: number }>,
): "PARTIAL" | "RECEIVED" {
  const allDone = lines.every((line) => line.receivedQty >= line.quantity);
  return allDone ? "RECEIVED" : "PARTIAL";
}

export function remainingQty(line: { quantity: number; receivedQty: number }): number {
  return Math.max(0, line.quantity - line.receivedQty);
}
