import type { PurchaseOrderLine } from "@prisma/client";

export type IssuedDocumentLineItem = {
  desc: string;
  qty: number;
  price: number;
};

export function mapPoLinesToIssuedItems(
  lines: Pick<PurchaseOrderLine, "description" | "quantity" | "unitPrice">[],
): IssuedDocumentLineItem[] {
  return lines.map((line) => ({
    desc: line.description,
    qty: line.quantity,
    price: line.unitPrice,
  }));
}

export function netAmountFromIssuedItems(items: IssuedDocumentLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.qty * item.price, 0) * 100) / 100;
}
