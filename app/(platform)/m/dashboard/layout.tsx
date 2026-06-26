import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MobileDashLayout from "@/components/dashboard-mobile/MobileDashLayout";

export const dynamic = "force-dynamic";

export default async function MobileDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");
  return <MobileDashLayout>{children}</MobileDashLayout>;
}
