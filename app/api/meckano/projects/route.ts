import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { meckanoFetch } from "@/lib/meckano-fetch";
import { requireMeckanoSession } from "@/lib/meckano-route-auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const auth = await requireMeckanoSession(session);
    if ("error" in auth) return auth.error;

    const response = await meckanoFetch("tasks", auth.apiKey);
    const data = await response.json();

    if (!data.status) {
      return NextResponse.json(
        { error: data.message || "Meckano API error", details: data },
        { status: 400 },
      );
    }

    const projects = data.data.map((task: Record<string, unknown>) => ({
      id: task.id,
      name: (task.description as string) || (task.comment as string) || `Project ${task.id}`,
    }));

    return NextResponse.json({ success: true, projects });
  } catch (error: unknown) {
    console.error("Meckano Projects Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch Meckano projects", details: message },
      { status: 500 },
    );
  }
}
