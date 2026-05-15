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

    const response = await meckanoFetch("users", auth.apiKey);
    const data = await response.json();

    if (!data.status) {
      return NextResponse.json(
        { error: data.message || "Meckano API error", details: data },
        { status: 400 },
      );
    }

    const employees = data.data.map((user: Record<string, unknown>) => ({
      id: user.id,
      name:
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        (user.workerTag as string) ||
        (user.email as string),
      email: user.email,
      phone: user.phone,
      department:
        (user.department as { name?: string } | undefined)?.name || "ללא מחלקה",
    }));

    return NextResponse.json({ success: true, employees });
  } catch (error: unknown) {
    console.error("Meckano Employees Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch Meckano employees", details: message },
      { status: 500 },
    );
  }
}
