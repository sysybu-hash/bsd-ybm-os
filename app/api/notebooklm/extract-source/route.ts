import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { chatWithAttachment } from "@/lib/ai-chat-vision";
import { extractTextForNotebook } from "@/lib/google-drive-file-content";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  inferMimeFromFileName,
  isSupportedScanMime,
  MAX_SCAN_FILE_BYTES,
} from "@/lib/scan-mime";

export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 60;

const PLACEHOLDER_PREFIXES = ["[קובץ תמונה", "[קובץ:"];

async function extractWithGemini(buffer: Buffer, fileName: string, mime: string): Promise<string> {
  const prompt =
    "חלץ את כל הטקסט הרלוונטי מהקובץ לשימוש כמקור במחברת BSD-YBM. ענה בעברית. החזר רק את תוכן המסמך, ללא הערות מטא.";
  return chatWithAttachment(prompt, {
    data: buffer.toString("base64"),
    mimeType: mime,
  });
}

export const POST = withWorkspacesAuth(async (req, { userId }) => {
  try {
    const rateKey = `notebooklm-extract-source:user:${userId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonBadRequest("בקשה לא תקינה", "invalid_form");
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return jsonBadRequest("לא נמצא קובץ", "missing_file");
    }

    if (file.size > MAX_SCAN_FILE_BYTES) {
      return jsonBadRequest("קובץ גדול מדי (מקסימום 25MB)", "file_too_large");
    }

    const mime = inferMimeFromFileName(file.name, file.type || "application/octet-stream");
    if (!isSupportedScanMime(mime)) {
      return jsonBadRequest(`סוג קובץ לא נתמך: ${mime}`, "unsupported_type");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = await extractTextForNotebook(buffer, file.name, mime);

    const needsGemini =
      PLACEHOLDER_PREFIXES.some((p) => text.startsWith(p)) ||
      (text.length < 40 && !mime.startsWith("text/"));

    if (needsGemini) {
      try {
        text = (await extractWithGemini(buffer, file.name, mime)).trim();
      } catch {
        /* keep partial text */
      }
    }

    if (!text.trim()) {
      return jsonBadRequest("לא ניתן לחלץ טקסט מהקובץ", "empty_extract");
    }

    return Response.json({ text: text.trim(), mimeType: mime, fileName: file.name });
  } catch (error) {
    return apiErrorResponse(error, "notebooklm/extract-source");
  }
});
