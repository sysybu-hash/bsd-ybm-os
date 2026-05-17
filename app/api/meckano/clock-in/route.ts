import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { MECKANO_SUBSCRIBER_EMAIL, isMeckanoSubscriberEmail } from "@/lib/meckano-access";
import { meckanoFetch } from "@/lib/meckano-fetch";
import { meckanoSessionFromWorkspace, requireMeckanoSession } from "@/lib/meckano-route-auth";

export const POST = withWorkspacesAuth(async (request, ctx): Promise<NextResponse> => {
  try {
    const sessionLike = await meckanoSessionFromWorkspace(ctx);
    const auth = await requireMeckanoSession(sessionLike);
    if ("error" in auth) return auth.error;
    const apiKey = auth.apiKey;

    const body = await request.json();
    const { action } = body;

    const usersRes = await meckanoFetch("users", apiKey, { method: "GET" });

    if (!usersRes.ok) {
      return NextResponse.json({ error: "נכשל החיבור למערכת Meckano (Users API)" }, { status: usersRes.status });
    }

    const usersData = await usersRes.json();
    const lookupEmail = isMeckanoSubscriberEmail(sessionLike.user?.email)
      ? sessionLike.user!.email!
      : MECKANO_SUBSCRIBER_EMAIL;
    const meckanoUser = usersData.data?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === lookupEmail.toLowerCase(),
    );

    if (!meckanoUser) {
      return NextResponse.json({ error: "משתמש לא נמצא במערכת Meckano" }, { status: 404 });
    }

    const meckanoUserId = meckanoUser.id;

    const punchRes = await meckanoFetch("punch", apiKey, {
      method: "POST",
      body: JSON.stringify({
        userId: meckanoUserId,
        action: action === "in" ? "checkin" : "checkout",
        date: new Date().toISOString(),
      }),
    });

    const punchData = await punchRes.json().catch(() => ({ status: "error", message: "תגובה לא תקינה ממקאנו" }));

    if (!punchRes.ok || punchData.status === "error") {
      return NextResponse.json(
        { error: punchData.message || "שגיאה בדיווח הנוכחות" },
        { status: punchRes.status || 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: action === "in" ? "כניסה דווחה בהצלחה ל-Meckano" : "יציאה דווחה בהצלחה ל-Meckano",
      meckanoId: meckanoUserId,
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Meckano Clock-in Error");
  }
});
