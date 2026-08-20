"use client";

import { useRouter } from "next/navigation";
import PublicPageShell from "@/components/landing/marketing/PublicPageShell";
import PricingSection from "@/components/landing/marketing/PricingSection";

export default function PricingPageClient() {
  const router = useRouter();
  return (
    <PublicPageShell tone="cinematic">
      <PricingSection onRegister={() => router.push("/login?mode=register")} />
    </PublicPageShell>
  );
}
