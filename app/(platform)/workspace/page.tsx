import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAccountantRole } from "@/lib/accountant-auth";
import OmniCanvasWorkspaceLoader from "@/components/os/OmniCanvasWorkspaceLoader";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }
  // רו"ח חיצוני — פורטל קריאה-בלבד ייעודי במקום מרחב העבודה המלא.
  if (isAccountantRole(session.user?.role)) {
    redirect("/accountant");
  }
  return <OmniCanvasWorkspaceLoader />;
}
