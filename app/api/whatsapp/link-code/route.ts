import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonTooManyRequests } from "@/lib/api-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { isWhatsappConfigured } from "@/lib/whatsapp/client";
import { generateWhatsappLinkCode } from "@/lib/whatsapp/link-codes";

export const dynamic = "force-dynamic";

/** מפיק קוד חד-פעמי לחיבור מספר WhatsApp לארגון של המשתמש המחובר. */
export const POST = withWorkspacesAuth(async (_req, { orgId, userId }) => {
  try {
    if (!isWhatsappConfigured()) {
      return NextResponse.json(
        { error: "אינטגרציית WhatsApp אינה מוגדרת בשרת." },
        { status: 503 },
      );
    }
    const rl = await checkRateLimit(`whatsapp-link-code:user:${userId}`, 5, 10 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests("יותר מדי בקשות קוד — נסו שוב בעוד כמה דקות.");
    }
    const { code, expiresAt } = await generateWhatsappLinkCode(orgId, userId);
    return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    return apiErrorResponse(err, "api/whatsapp/link-code");
  }
});
