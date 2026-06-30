import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The classic dashboard is now a single responsive shell at /dashboard
 * (sidebar on desktop, bottom-nav on mobile). The old separate mobile tree is
 * retired — every /m/dashboard/* path redirects to the unified shell.
 * (Session is enforced by /dashboard.)
 */
export default function MobileDashboardLayout() {
  redirect("/dashboard");
}
