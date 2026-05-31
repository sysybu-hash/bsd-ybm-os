import { getUserFacingAiErrorMessage } from "@/lib/ai-chat";
import { jsonServerError } from "@/lib/api-json";
import { getUserFacingDbErrorMessage } from "@/lib/prisma-error-message";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-route");

/** תגובת שגיאה אחידה לנתיבי API — ללא דליפת פרטי שגיאה פנימיים. */
export function apiErrorResponse(err: unknown, logLabel: string): ReturnType<typeof jsonServerError> {
  log.error(logLabel, err);
  const dbMessage = getUserFacingDbErrorMessage(err);
  const message = dbMessage ?? getUserFacingAiErrorMessage(err, "he");
  return jsonServerError(message);
}
