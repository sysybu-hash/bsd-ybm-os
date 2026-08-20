import { revalidatePath } from "next/cache";

/** מרענן משטחי ERP/מסמכים אחרי שינוי בנתונים (workspace + redirect ישן) */
export function revalidateErpDocumentsSurfaces(): void {
  revalidatePath("/workspace");
  revalidatePath("/app/documents/erp");
}
