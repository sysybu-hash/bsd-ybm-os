import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MarketingCinematicShell from "@/components/landing/marketing/MarketingCinematicShell";
import OmniCanvasWorkspace from "@/components/os/OmniCanvasWorkspace";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <MarketingCinematicShell />;
  }

  return <OmniCanvasWorkspace />;
}
