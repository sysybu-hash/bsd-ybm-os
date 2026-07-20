import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

/** Classic dashboard mode — reachable from workspace sidebar / guide / mobile nav. */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }
  return <DashboardShell />;
}
