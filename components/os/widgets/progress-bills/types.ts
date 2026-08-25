/** Shared between ProgressBillPortalPanel and useProgressBillPortalData. */
export type { ProgressBillPortalRow } from "@/lib/validation/schemas/progress-bill-portal";

export type ProjectOption = { id: string; name: string };

export type BoqOption = {
  id: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number;
};
