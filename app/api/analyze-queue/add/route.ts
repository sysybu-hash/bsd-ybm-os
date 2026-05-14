import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
} from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import type { DocumentScanFilePayload } from "@/lib/analyze-queue";
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";

/**
 * מכסה נפרדת מ־/api/ai — שם אותו מפתח היה גורם ל־4 מנועים לאכול 4/5 בקשות לשעה ולקבל 429.
 * העלאה לתור זולה; מכסת סריקות ועלות API נשארות ב־processDocumentAction.
 */
const QUEUE_ENQUEUE_PER_HOUR = 60;
const QUEUE_ENQUEUE_PER_HOUR_PLATFORM = 200;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const orgId = session.user.organizationId ?? "";
    if (!orgId) {
      return jsonBadRequest("לא נמצא ארגון למשתמש", "no_org");
    }

    if (process.env.NODE_ENV === "production" && !process.env.ANALYZE_QUEUE_SECRET?.trim()) {
      return jsonServiceUnavailable(
        "חסר ANALYZE_QUEUE_SECRET — לא ניתן להריץ את תור הסריקה בייצור.",
        "queue_secret_missing",
      );
    }

    const dev = isAdmin(session.user.email);
    const limit = dev ? QUEUE_ENQUEUE_PER_HOUR_PLATFORM : QUEUE_ENQUEUE_PER_HOUR;
    const rateKey = orgId
      ? `scan-queue-enqueue:org:${orgId}`
      : `scan-queue-enqueue:user:${session.user.id}`;
    const rl = await checkRateLimit(rateKey, limit, 60 * 60 * 1000);

    if (!rl.success) {
      return jsonTooManyRequests(
        `חרגת ממכסת השימוש המותרת לשעה זו. נסה שוב לאחר ${rl.resetAt.toLocaleTimeString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt.toISOString() },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonBadRequest("לא נמצא קובץ", "missing_file");
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const persist = formData.get("persist") !== "false";

    const payload: DocumentScanFilePayload = {
      kind: "inline",
      base64,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      provider: String(formData.get("provider") ?? "gemini"),
      analysisType: String(formData.get("analysisType") ?? "INVOICE"),
      industry: String(formData.get("industry") ?? "CONSTRUCTION"),
      language: String(formData.get("language") ?? "auto"),
      model: String(formData.get("model") ?? ""),
      persist,
    };

    const job = await prisma.documentScanJob.create({
      data: {
        status: "PENDING",
        fileData: JSON.stringify(payload),
        userId: session.user.id,
        organizationId: orgId,
      },
    });

    /** ב-Vercel, fetch פנימי ל־/process לעיתים לא רץ — מרוקנים תור מקומית אחרי שליחת התשובה */
    after(async () => {
      try {
        await drainDocumentScanQueue(40);
      } catch (e) {
        console.error("[analyze-queue/add] after() drain", e);
      }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("[analyze-queue/add]", error);
    return jsonServerError("שגיאה פנימית בשרת");
  }
}
