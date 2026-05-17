import { getUserFacingAiErrorMessage } from "@/lib/ai-chat";
import { jsonServerError } from "@/lib/api-json";

/** תגובת שגיאה אחידה לנתיבי API — ללא דליפת פרטי שגיאה פנימיים. */
export function apiErrorResponse(err: unknown, logLabel: string): ReturnType<typeof jsonServerError> {
  console.error(logLabel, err);
  const message = getUserFacingAiErrorMessage(err, "he");
  return jsonServerError(message);
}
