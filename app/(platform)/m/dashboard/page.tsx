import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MobileDashboardRoot() {
  redirect("/m/dashboard/crm");
}
