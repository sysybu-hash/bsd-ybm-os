import { redirect } from "next/navigation";
import { buildDocumentsHubPath } from "@/lib/workspace-documents-url";

export const dynamic = "force-dynamic";

/** תאימות לאחור — לינקים ישנים במיילים (`/app/documents/erp`) */
export default function LegacyErpDocumentsRedirect() {
  redirect(buildDocumentsHubPath("archive"));
}
