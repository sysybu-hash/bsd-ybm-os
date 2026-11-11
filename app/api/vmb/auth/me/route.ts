import { NextResponse } from "next/server";
import { withVmbAuth } from "@/lib/vmb/api";

export const dynamic = "force-dynamic";

export const GET = withVmbAuth(async (_req, { user }) => NextResponse.json({ user }));
