import "./marketing-cinematic.css";
import MarketingCinematicPage from "@/components/landing/marketing/MarketingCinematicPage";

/** Server wrapper — loads cinematic CSS with the route, not after client hydration. */
export default function MarketingCinematicShell() {
  return <MarketingCinematicPage />;
}
