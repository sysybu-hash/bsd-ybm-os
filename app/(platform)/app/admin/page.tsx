import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import PlatformAdminConsole from "@/components/admin/PlatformAdminConsole";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email || !isAdmin(email)) {
    redirect("/");
  }

  return <PlatformAdminConsole variant="page" />;
}
