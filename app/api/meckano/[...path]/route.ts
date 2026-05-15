import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonForbidden, jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";
import { meckanoHeaders, meckanoRestUrl } from "@/lib/meckano-fetch";

export const dynamic = "force-dynamic";

async function getOrgKey(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { meckanoApiKey: true },
  });
  return org?.meckanoApiKey ?? null;
}

async function proxyRequest(req: Request, segments: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return jsonUnauthorized();
  }
  const orgId = await getAuthorizedMeckanoOrganizationId(session);
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
  let contentType = req.headers.get("content-type") ?? "application/json";
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(req, path);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(req, path);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(req, path);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(req, path);
}
