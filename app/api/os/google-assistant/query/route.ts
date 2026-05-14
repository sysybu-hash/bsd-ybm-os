import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleAssistantService } from "@/lib/services/google-assistant";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const assistantService = await GoogleAssistantService.forUser(session.user.id);
    const result = await assistantService.query(query);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Google Assistant API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to query Google Assistant" },
      { status: 500 }
    );
  }
}
