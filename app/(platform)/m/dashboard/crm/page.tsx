import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Non-core mobile tab — use workspace CRM. */
export default function MobileCrmRedirectPage() {
  redirect("/workspace");
}
