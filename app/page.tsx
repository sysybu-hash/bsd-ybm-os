import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MarketingCinematicPage from "@/components/landing/marketing/MarketingCinematicPage";
import OmniCanvasWorkspace from "@/components/os/OmniCanvasWorkspace";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <MarketingCinematicPage />;
  }

  return <OmniCanvasWorkspace />;
}
