import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MobileDashLayout from "@/components/dashboard-mobile/MobileDashLayout";

export const dynamic = "force-dynamic";

/**
 * Core mobile tabs live here: home / scanner / projects.
 * Other /m/dashboard/* pages redirect to home (see those page files).
 */
export default async function MobileDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  return <MobileDashLayout>{children}</MobileDashLayout>;
}
