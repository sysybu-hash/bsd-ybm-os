import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  DEFAULT_ORG_MAIL_PREFS,
  getOrgMailPrefs,
  orgMailPrefsSchema,
  updateOrgMailPrefs,
} from "@/lib/mail/org-mail-settings";

export const dynamic = "force-dynamic";

const patchSchema = orgMailPrefsSchema.partial();

export const GET = withWorkspacesAuth(
  async (_req, { orgId }) => {
    const prefs = await getOrgMailPrefs(orgId);
    return NextResponse.json({ prefs, defaults: DEFAULT_ORG_MAIL_PREFS });
  },
  { allowedRoles: ["ORG_ADMIN", "SUPER_ADMIN"] },
);

export const PATCH = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    const prefs = await updateOrgMailPrefs(orgId, data);
    return NextResponse.json({ ok: true, prefs });
  },
  {
    schema: patchSchema,
    allowedRoles: ["ORG_ADMIN", "SUPER_ADMIN"],
  },
);
