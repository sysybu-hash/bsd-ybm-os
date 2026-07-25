import type { Metadata } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import PricingPageClient from "./PricingPageClient";

export const metadata: Metadata = {
  title: "תמחור — BSD-YBM OS",
  description: "מסלולי מנוי למערכת התפעול העסקית BSD-YBM OS — CRM, מסמכים, סריקת AI, חיוב ותזרים.",
  alternates: { canonical: `${getCanonicalSiteUrl()}/pricing` },
  openGraph: {
    type: "website",
    title: "תמחור — BSD-YBM OS",
    description: "מסלולי מנוי למערכת התפעול העסקית BSD-YBM OS.",
    url: `${getCanonicalSiteUrl()}/pricing`,
  },
};

export default function PricingPage() {
  return <PricingPageClient />;
}
