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
  createHouseBookletJob,
  getHouseBookletJob,
  houseBookletPdf,
  houseBookletView,
  houseReviewPictureRef,
  HouseBookletStateError,
  keepHouseBookletOnDisk,
  retryHouseBookletJob,
  scheduleHouseStep,
} from "@/lib/projects/building/house-booklet-job";
import { houseFileStore } from "@/lib/projects/building/house-store";
import { fetchFloorplanBlob } from "@/lib/projects/floorplan-blob";
import { isPlanUploadId, readPlanUpload } from "@/lib/projects/floorplan-plan-upload";
import { vizAccessForUser } from "@/lib/projects/viz-access";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DXF_BYTES = 40 * 1024 * 1024;

/**
 * Start the private-house booklet from its floor and facade sheets (multipart:
 * `file`… — DWFs named like A-ground.dwf, A-floor1.dwf, facades.dwf, or a DXF
 * with a layout tab a sheet, and optionally house.json with what the hand
 * knows — `name`, and `ai=0` to read the sheets by their lines alone, no
 * vision call made): it is measured, in steps (house-booklet-steps.ts), and
 * waits for approval. Sheets past what one request carries are uploaded
 * first (Blob, or in parts) and named in JSON: `{ action: "create", name,
 * files: [{ name, blobUrl | uploadId }] }`. Or act on a job
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
    const create = async (files: Map<string, Buffer>, rawName: string, ai: boolean) => {
      const { project, problems } = houseProjectFromFiles(files);
      if (!project) return jsonBadRequest(problems.join(" · ") || "לא נמצאו תוכניות", "missing_fields");
      const name = rawName.trim().slice(0, 120) || "בית פרטי";
      const job = await createHouseBookletJob({ orgId, userId, name, files, project, ai, notes: problems.length ? [`files: ${problems.join(" · ")}`] : [] });
      const queued = await scheduleHouseStep(job.id);
      return NextResponse.json({ id: job.id, status: job.status, queued });
    };
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as {
        action?: string;
        id?: string;
        paint?: boolean;
        budgetIls?: number | string | null;
        name?: string;
        ai?: boolean;
        files?: Array<{ name?: string; blobUrl?: string; uploadId?: string }>;
      };
      if (body.action === "create") {
        const limited = await applyRateLimit(req, "building-booklet:house", 5, 3_600_000);
        if (limited) return limited;
        // The sheets already uploaded, each to Blob or in parts: a building's DXFs are past what one request carries.
        const files = new Map<string, Buffer>();
        for (const f of (body.files ?? []).slice(0, 20)) {
          const fileName = String(f.name ?? "").trim().slice(0, 180);
          if (!fileName) continue;
          const max = /\.dxf$/i.test(fileName) ? MAX_DXF_BYTES : MAX_BYTES;
          const read = f.blobUrl ? await fetchFloorplanBlob(f.blobUrl, max) : f.uploadId && isPlanUploadId(f.uploadId) ? await readPlanUpload(orgId, f.uploadId) : null;
          if (!read || read.bytes > max) return jsonBadRequest(`הקובץ ${fileName} לא התקבל או גדול מדי (מקסימום ${max / 1024 / 1024}MB)`, "file_unavailable");
          files.set(fileName, Buffer.from(read.base64, "base64"));
        }
        return create(files, String(body.name ?? ""), body.ai !== false);
      }
      const limited = await applyRateLimit(req, "building-booklet:house-action", 20, 3_600_000);
      if (limited) return limited;
      const job = await getHouseBookletJob(orgId, String(body.id ?? ""));
      if (!job) return jsonNotFound("החוברת לא נמצאה", "booklet_not_found");
      try {
        if (body.action === "approve") {
          const raw = body.budgetIls;
          const budgetIls = raw == null || raw === "" ? null : Number(raw);
          if (budgetIls != null && !(Number.isFinite(budgetIls) && budgetIls > 0)) return jsonBadRequest("תקרת התקציב חייבת להיות מספר חיובי בשקלים", "invalid_budget");
          await approveHouseBookletJob(job, { paint: body.paint !== false, budgetIls });
        } else if (body.action === "retry") {
          await retryHouseBookletJob(job);
        } else if (body.action === "accept") {
          await acceptHouseBookletUnpainted(job);
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
    return create(files, String(form.get("name") ?? ""), String(form.get("ai") ?? "1") !== "0");

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
      const ref = houseReviewPictureRef(job, modelId ?? "", rest.join("/"));
      // In Blob, the picture is sent from there: a 4000 px render can pass the 4.5 MB a function may answer.
      if (ref && /^https:\/\//.test(ref)) return NextResponse.redirect(ref, 302);
      const data = ref ? await (await houseFileStore()).get(ref) : null;
      if (!data) return jsonNotFound("התמונה לא נמצאה", "picture_not_found");
      return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }
    if (params.get("save") === "1") {
      const file = await keepHouseBookletOnDisk(job);
      if (!file) return jsonBadRequest("אין עותק לשמור", "booklet_not_saved");
      return NextResponse.json({ id: job.id, file });
    }
    if (params.get("pdf") === "1") {
      if (job.pdfRef && /^https:\/\//.test(job.pdfRef)) return NextResponse.redirect(job.pdfRef, 302);
      const pdf = await houseBookletPdf(job);
      if (!pdf) return jsonBadRequest("החוברת עדיין לא מוכנה", "booklet_not_ready");
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${job.name}.pdf`)}`,
        },
      });
    }
    return NextResponse.json(houseBookletView(job));
  } catch (error) {
    return apiErrorResponse(error, "house booklet status");
  }
});
