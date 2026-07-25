"use client";

import PublicPageShell from "@/components/landing/marketing/PublicPageShell";
import IndustriesSection from "@/components/landing/marketing/IndustriesSection";
import ModularitySection from "@/components/landing/marketing/ModularitySection";

export default function SolutionsPageClient() {
  return (
    <PublicPageShell tone="cinematic">
      <IndustriesSection />
      <ModularitySection />
    </PublicPageShell>
  );
}
