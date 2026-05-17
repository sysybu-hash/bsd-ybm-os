import { NextResponse } from "next/server";
import type { WorkspaceAuthContext } from "@/lib/api-handler";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonForbidden, jsonNotFound } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";
import { meckanoHeaders, meckanoRestUrl } from "@/lib/meckano-fetch";
import { apiErrorResponse } from "@/lib/api-route-helpers";

export const dynamic = "force-dynamic";

const MECKANO_API_PREFIX = "/api/meckano/";

function pathSegmentsFromRequest(req: Request): string[] {
  const pathname = new URL(req.url).pathname;
  const idx = pathname.indexOf(MECKANO_API_PREFIX);
  if (idx === -1) return [];
  return pathname.slice(idx + MECKANO_API_PREFIX.length).split("/").filter(Boolean);
}

async function getOrgKey(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { meckanoApiKey: true },
  });
  return org?.meckanoApiKey ?? null;
}

async function proxyRequest(req: Request, ctx: WorkspaceAuthContext, segments: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });

  const orgId = await getAuthorizedMeckanoOrganizationId({
    user: {
      organizationId: ctx.orgId,
      email: user?.email,
    },
  });
  if (!orgId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const apiKey = await getOrgKey(orgId);
  if (!apiKey) {
    return jsonNotFound("מקאנו לא מוגדר — הוסף API key בהגדרות", "meckano_not_configured");
  }

  const url = new URL(req.url);
  const meckanoUrl = `${meckanoRestUrl(segments.join("/"))}${url.search}`;

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
  }

  const upstream = await fetch(meckanoUrl, {
    method: req.method,
    headers: meckanoHeaders(apiKey),
    ...(body ? { body } : {}),
  });

  const data = (await upstream.json().catch(() => ({ status: false }))) as unknown;
  return NextResponse.json(data, { status: upstream.status });
}

async function handle(req: Request, ctx: WorkspaceAuthContext) {
  try {
    return proxyRequest(req, ctx, pathSegmentsFromRequest(req));
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/meckano proxy");
  }
}

export const GET = withWorkspacesAuth(handle);
export const POST = withWorkspacesAuth(handle);
export const PUT = withWorkspacesAuth(handle);
export const DELETE = withWorkspacesAuth(handle);
