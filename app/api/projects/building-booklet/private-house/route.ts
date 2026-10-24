import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonForbidden, jsonNotFound } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { houseProjectFromFiles } from "@/lib/projects/building/house-project";
import {
  acceptHouseBookletUnpainted,
  approveHouseBookletJob,
  getHouseBookletJob,
  houseBookletCost,
  houseBookletPdf,
  houseReviewPicture,
  HouseBookletStateError,
  keepHouseBookletOnDisk,
  retryHouseBookletJob,
  startHouseBookletJob,
} from "@/lib/projects/building/house-booklet-job";
import { vizAccessForUser } from "@/lib/projects/viz-access";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DXF_BYTES = 40 * 1024 * 1024;

/**
 * Start the private-house booklet from its floor and facade sheets (multipart:
 * `file`… — DWFs named like A-ground.dwf, A-floor1.dwf, facades.dwf, or a DXF
 * with a layout tab a sheet, and optionally house.json with what the hand
 * knows — and `name`): it is measured and waits for approval. Or act on a job
 * (JSON): `{ action: "approve", id, paint, budgetIls? }` paints the reviewed
 * renders within the ceiling (₪50 unless the server sets another) or, with
 * `paint: false`, puts the measured booklet together for free — and, after a
 * painting that stopped short, approves it again under a higher ceiling;
 * `{ action: "retry", id }` takes a failed job up again;
 * `{ action: "accept", id }` makes a stopped painting's booklet as it stands,
 * the pictures that did not hold shown as measured renders, no call made.
 */
export const POST = withWorkspacesAuth(async (req, { orgId, userId, role }) => {
  try {
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    const access = await vizAccessForUser(userId, orgId);
    if (!access.subscriber) return jsonForbidden("ההדמיה המדודה פתוחה למנויים פעילים");
    if (!access.paint) return jsonForbidden("חוברת הבית הפרטי פתוחה לבעל המערכת.");
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const limited = await applyRateLimit(req, "building-booklet:house-action", 20, 3_600_000);
      if (limited) return limited;
      const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; paint?: boolean; budgetIls?: number | string | null };
      const job = await getHouseBookletJob(orgId, String(body.id ?? ""));
      if (!job) return jsonNotFound("החוברת לא נמצאה", "booklet_not_found");
      try {
        if (body.action === "approve") {
          const raw = body.budgetIls;
          const budgetIls = raw == null || raw === "" ? null : Number(raw);
          if (budgetIls != null && !(Number.isFinite(budgetIls) && budgetIls > 0)) return jsonBadRequest("תקרת התקציב חייבת להיות מספר חיובי בשקלים", "invalid_budget");
          approveHouseBookletJob(job, { paint: body.paint !== false, budgetIls });
        } else if (body.action === "retry") {
          retryHouseBookletJob(job);
        } else if (body.action === "accept") {
          acceptHouseBookletUnpainted(job);
        } else {
          return jsonBadRequest("פעולה לא מוכרת", "invalid_action");
        }
      } catch (err) {
        if (err instanceof HouseBookletStateError) return jsonBadRequest(err.message, "invalid_state");
        throw err;
      }
      return NextResponse.json({ id: job.id, status: job.status });
    }

    const limited = await applyRateLimit(req, "building-booklet:house", 5, 3_600_000);
    if (limited) return limited;
    const form = await req.formData();
    const files = new Map<string, Buffer>();
    for (const entry of form.getAll("file")) {
      if (!(entry instanceof File)) continue;
      const max = /\.dxf$/i.test(entry.name) ? MAX_DXF_BYTES : MAX_BYTES;
      if (entry.size > max) return jsonBadRequest(`הקובץ ${entry.name} גדול מדי (מקסימום ${max / 1024 / 1024}MB)`, "file_too_large");
      files.set(entry.name, Buffer.from(await entry.arrayBuffer()));
    }
    const { project, problems } = houseProjectFromFiles(files);
    if (!project) return jsonBadRequest(problems.join(" · ") || "לא נמצאו תוכניות", "missing_fields");
    const name = String(form.get("name") ?? "").trim().slice(0, 120) || "בית פרטי";
    const job = await startHouseBookletJob({ orgId, name, files, project });
    if (problems.length) job.steps.push(`0s files: ${problems.join(" · ")}`);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (error) {
    return apiErrorResponse(error, "house booklet create");
  }
});

/**
 * Where the booklet stands, with its review once measured and its cost so
 * far. `picture=<model>/<name>`: a measured render of the review;
 * `pdf=1`: the booklet once it is done.
 */
export const GET = withWorkspacesAuth(async (req, { orgId, userId, role }) => {
  try {
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    const access = await vizAccessForUser(userId, orgId);
    if (!access.paint) return jsonForbidden("חוברת הבית הפרטי פתוחה לבעל המערכת.");
    const params = new URL(req.url).searchParams;
    const job = await getHouseBookletJob(orgId, params.get("id") ?? "");
    if (!job) return jsonNotFound("החוברת לא נמצאה", "booklet_not_found");
    const picture = params.get("picture");
    if (picture) {
      const [modelId, ...rest] = picture.split("/");
      const data = await houseReviewPicture(job, modelId ?? "", rest.join("/"));
      if (!data) return jsonNotFound("התמונה לא נמצאה", "picture_not_found");
      return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }
    if (params.get("save") === "1") {
      const file = await keepHouseBookletOnDisk(job);
      if (!file) return jsonBadRequest("אין עותק לשמור", "booklet_not_saved");
      return NextResponse.json({ id: job.id, file });
    }
    if (params.get("pdf") === "1") {
      const pdf = await houseBookletPdf(job);
      if (!pdf) return jsonBadRequest("החוברת עדיין לא מוכנה", "booklet_not_ready");
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${job.name}.pdf`)}`,
        },
      });
    }
    return NextResponse.json({
      id: job.id,
      name: job.name,
      status: job.status,
      phase: job.phase,
      steps: job.steps,
      error: job.error ?? null,
      resumable: job.resumable ?? false,
      seconds: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
      bytes: job.bytes ?? 0,
      review: job.review ?? null,
      approval: job.approval ?? null,
      cost: houseBookletCost(job),
      report: job.report ?? null,
      unpainted: job.unpainted ?? [],
    });
  } catch (error) {
    return apiErrorResponse(error, "house booklet status");
  }
});
