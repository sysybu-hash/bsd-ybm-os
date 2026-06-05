import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { computeJewishCalendarDay } from "@/lib/jewish-calendar/compute-day";

export const GET = withWorkspacesAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const locationId = searchParams.get("locationId");
    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng");
    const elevationRaw = searchParams.get("elevation");

    const lat = latRaw != null ? Number(latRaw) : undefined;
    const lng = lngRaw != null ? Number(lngRaw) : undefined;
    const elevation = elevationRaw != null ? Number(elevationRaw) : undefined;

    const snapshot = computeJewishCalendarDay({
      date,
      locationId,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      elevation: Number.isFinite(elevation) ? elevation : undefined,
    });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=300, s-maxage=3600",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Jewish calendar day GET");
  }
});
