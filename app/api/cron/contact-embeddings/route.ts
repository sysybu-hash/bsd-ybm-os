import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runContactEmbeddingsCron } from "@/lib/crm/contact-embedding-cron";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-contact-embeddings",
    { type: "crontab", value: "0 3 * * 0" },
    async () => runContactEmbeddingsCron(),
  );
}
