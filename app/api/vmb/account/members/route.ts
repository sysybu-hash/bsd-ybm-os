import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { inviteMember, removeMember, revokeInvite, type MemberResult } from "@/lib/vmb/members";
import { ensureWorkspace } from "@/lib/vmb/workspace";

export const dynamic = "force-dynamic";

const STATUS = { not_owner: 403, already_member: 409, has_office: 409, not_found: 404, self: 400 } as const;
const reply = (r: MemberResult) => (r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: r.code }, { status: STATUS[r.code] }));

const inviteSchema = z.object({ email: z.string().trim().email().max(254) });
const removeSchema = z.union([z.object({ userId: z.string().min(1).max(64) }), z.object({ inviteId: z.string().min(1).max(64) })]);

/** The office owner invites an address to the office. */
export const POST = withVmbAuth(async (req, { user }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:invite", 10, 60_000);
  if (limited) return limited;
  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const ws = await ensureWorkspace(user);
  return reply(await inviteMember(user.id, ws.id, parsed.data.email));
});

/** The office owner removes a member, or takes back an invitation. */
export const DELETE = withVmbAuth(async (req, { user }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:member-remove", 20, 60_000);
  if (limited) return limited;
  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const ws = await ensureWorkspace(user);
  return reply("userId" in parsed.data ? await removeMember(user.id, ws.id, parsed.data.userId) : await revokeInvite(user.id, ws.id, parsed.data.inviteId));
});
