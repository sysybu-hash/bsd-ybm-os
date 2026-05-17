import pdfParse from "pdf-parse";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const REQUESTS_PER_HOUR = 40;

export const POST = withWorkspacesAuth(async (req, { userId }) => {
  try {
    const rateKey = `notebooklm-extract-pdf:user:${userId}`;
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

    if (file.size > MAX_PDF_BYTES) {
      return jsonBadRequest("קובץ גדול מדי (מקסימום 25MB)", "file_too_large");
    }

    const mime = file.type || "application/pdf";
    if (mime !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return jsonBadRequest("נדרש קובץ PDF", "invalid_type");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);

    return Response.json({ text: data.text });
  } catch (error) {
    return apiErrorResponse(error, "notebooklm/extract-pdf");
  }
});
