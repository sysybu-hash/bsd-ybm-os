import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OmniCanvasWorkspaceLoader from "@/components/os/OmniCanvasWorkspaceLoader";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }
  return <OmniCanvasWorkspaceLoader />;
}
