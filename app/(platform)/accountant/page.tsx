import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAccountantRole } from "@/lib/accountant-auth";
import { isOrgAdminRole } from "@/lib/workspace-access";
import AccountantPortalClient from "@/components/accountant/AccountantPortalClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "פורטל רואה חשבון · BSD-YBM OS",
  robots: { index: false, follow: false },
};

export default async function AccountantPortalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  // רו"ח נכנס לפורטל; מנהל ארגון רשאי להציץ. כל שאר התפקידים — למרחב העבודה.
  if (!isAccountantRole(role) && !isOrgAdminRole(role)) {
    redirect("/workspace");
  }

  return <AccountantPortalClient orgName={session.user.name ?? ""} />;
}
