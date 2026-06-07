import { buildAssetLinksJson } from "@/lib/pwa/assetlinks";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildAssetLinksJson(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
