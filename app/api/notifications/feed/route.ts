import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { getUnreadNotificationsFeed } from "@/lib/workspace-api/notifications-feed";

export const GET = withWorkspacesAuth(async (_req, { userId }) => {
  try {
    const feed = await getUnreadNotificationsFeed(userId);
    return NextResponse.json(feed);
  } catch (error) {
    return apiErrorResponse(error, "Notifications feed GET");
  }
});
