import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createHouseBookletJob, getHouseBookletJob, houseBookletView } from "@/lib/projects/building/house-booklet-job";
import { houseProjectFromFiles } from "@/lib/projects/building/house-project";
import { houseFileStore } from "@/lib/projects/building/house-store";

export const dynamic = "force-dynamic";

/*
 * TEMPORARY — deleted before merge. Checks the house booklet's steps on a
 * Preview, which is behind SSO: a job made from uploaded sheets with the
 * vision model off (nothing paid), driven by /api/cron/house-booklet-step.
 */
const ORG = "house-booklet-probe";

function authorised(req: NextRequest): boolean {
  const secret = env.CRON_SECRET?.trim();
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const files = new Map<string, Buffer>();
  for (const entry of form.getAll("file")) if (entry instanceof File) files.set(entry.name, Buffer.from(await entry.arrayBuffer()));
  const { project, problems } = houseProjectFromFiles(files);
  if (!project) return NextResponse.json({ problems }, { status: 400 });
  const job = await createHouseBookletJob({ orgId: ORG, userId: "probe", name: "גוטליב probe", files, project, ai: false });
  return NextResponse.json({ id: job.id, store: (await houseFileStore()).kind, project });
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const job = await getHouseBookletJob(ORG, req.nextUrl.searchParams.get("id") ?? "");
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...houseBookletView(job), store: (await houseFileStore()).kind, at: job.at, tries: job.tries ?? 0, models: job.models?.map((m) => ({ id: m.id, artefacts: Object.keys(m.state.artefacts ?? {}) })) ?? [] });
}
