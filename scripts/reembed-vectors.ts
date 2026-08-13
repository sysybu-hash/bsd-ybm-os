/**
 * One-shot re-embed after switching to gemini-embedding-2.
 * Usage: npx tsx scripts/reembed-vectors.ts
 */
import { config as loadDotenv } from "dotenv";
import { reembedAllVectors } from "@/lib/embeddings/reembed-all";

loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local", override: true });

async function main() {
  const result = await reembedAllVectors({
    batchSize: 20,
    onProgress: (done, total, kind) => {
      console.log(`${kind} ${done}/${total}`);
    },
  });
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
