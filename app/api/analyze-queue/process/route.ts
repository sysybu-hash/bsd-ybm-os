import { NextResponse } from "next/server";
import { assertAnalyzeQueueProcessAuthorized } from "@/lib/analyze-queue";
import { jsonUnauthorized } from "@/lib/api-json";
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!assertAnalyzeQueueProcessAuthorized(req)) {
    return jsonUnauthorized("גישה נדחתה — אימות תור לא תקין.");
  }
  const count = await drainDocumentScanQueue(30);
  return NextResponse.json({ ok: true, processed: count > 0, count });
}

export async function POST(req: Request) {
  if (!assertAnalyzeQueueProcessAuthorized(req)) {
    return jsonUnauthorized("גישה נדחתה — אימות תור לא תקין.");
  }
  const count = await drainDocumentScanQueue(30);
  return NextResponse.json({ ok: true, processed: count > 0, count });
}
