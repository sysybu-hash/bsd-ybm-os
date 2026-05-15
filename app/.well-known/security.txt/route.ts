import { legalSite } from "@/lib/legal-site";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export const dynamic = "force-static";

export async function GET() {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  const body = [
    "Contact: mailto:" + legalSite.contactEmail,
    "Expires: 2027-12-31T23:59:59.000Z",
    "Preferred-Languages: he, en, ru",
    "Canonical: " + base + "/.well-known/security.txt",
    "Policy: " + base + "/privacy",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
