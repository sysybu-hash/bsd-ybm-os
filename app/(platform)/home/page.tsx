import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAccountantRole } from "@/lib/accountant-auth";
import OmniCanvasWorkspaceLoader from "@/components/os/OmniCanvasWorkspaceLoader";

export const dynamic = "force-dynamic";

/**
 * Friendly OS home URL: https://bsd-ybm.co.il/home
 * Same workspace canvas as /workspace (kept for existing bookmarks).
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/home");
  }
  if (isAccountantRole(session.user?.role)) {
    redirect("/accountant");
  }
  return <OmniCanvasWorkspaceLoader />;
}
