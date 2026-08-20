"use client";

import { useRouter } from "next/navigation";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import { classicSectionById, type ClassicSectionId } from "@/lib/classic/sections";

/**
 * Mobile classic home — the same DashboardOverview as the desktop classic shell,
 * so the dashboard is the landing screen of the classic mode on every device
 * (instead of being buried in the "more" tab). Quick-action cards route to the
 * matching mobile section from the shared registry.
 */
export default function MobileHomePage() {
  const router = useRouter();

  return (
    <div className="p-4">
      <DashboardOverview
        onNavigate={(id) => {
          const section = classicSectionById(id as ClassicSectionId);
          if (section) router.push(section.mobileHref);
        }}
      />
    </div>
  );
}
