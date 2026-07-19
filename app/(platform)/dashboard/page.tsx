import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ classic?: string | string[] }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const sp = await searchParams;
  const classicRaw = sp.classic;
  const classic =
    typeof classicRaw === "string"
      ? classicRaw
      : Array.isArray(classicRaw)
        ? classicRaw[0]
        : undefined;

  // Default: workspace OS. Escape hatch for one release: /dashboard?classic=1
  if (classic !== "1") {
    redirect("/workspace");
  }

  return <DashboardShell />;
}
