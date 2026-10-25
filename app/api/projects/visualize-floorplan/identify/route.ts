import { NextResponse } from "next/server";

import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonForbidden } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { fetchFloorplanBlob } from "@/lib/projects/floorplan-blob";
import { readPlanUpload } from "@/lib/projects/floorplan-plan-upload";
import { identifyStructure } from "@/lib/projects/structure/identify";
import { choiceRecordOf, rememberStructure, structureFingerprint } from "@/lib/projects/structure/report-cache";
import { vizAccessForUser } from "@/lib/projects/viz-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A request body; larger drawings come staged (Blob, or parts) and only their ids ride in it. */
const MAX_INLINE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 12;

/**
 * What an upload is, before anything is produced: its plans with previews,
 * the kind of structure they make and how sure that is, and what was not
 * read (lib/projects/structure). Free — no model is called. Several files
 * are read as one house's sheets.
 *
 * Multipart: `file` (repeatable, small files), `blobUrl` and `uploadId`
 * (repeatable, staged files). Answers `{ report, fingerprint }`; the run takes
 * the fingerprint with the structure and plans the person confirmed.
 */
export const POST = withWorkspacesAuth(
  async (req, { orgId, userId, role }) => {
    try {
      const block = await guardConstructionOnlyApi(orgId, role);
      if (block) return block;
      const access = await vizAccessForUser(userId, orgId);
      if (!access.subscriber) return jsonForbidden("ההדמיה המדודה פתוחה למנויים פעילים");

      const form = await req.formData();
      const files: Array<{ name: string; bytes: Buffer }> = [];
      for (const entry of form.getAll("file")) {
        if (!(entry instanceof File) || entry.size === 0) continue;
        if (entry.size > MAX_INLINE_BYTES) return jsonBadRequest("הקובץ גדול מדי (מקסימום 4MB)", "file_too_large");
        files.push({ name: entry.name, bytes: Buffer.from(await entry.arrayBuffer()) });
      }
      for (const raw of form.getAll("blobUrl")) {
        const fetched = await fetchFloorplanBlob(String(raw).trim());
        if (!fetched) return jsonBadRequest("קובץ התוכנית שהועלה אינו זמין", "blob_unavailable");
        files.push({ name: fetched.fileName ?? "plan", bytes: Buffer.from(fetched.base64, "base64") });
      }
      for (const raw of form.getAll("uploadId")) {
        // Left in place: the run reads the same parts.
        const staged = await readPlanUpload(orgId, String(raw).trim());
        if (!staged) return jsonBadRequest("קובץ התוכנית שהועלה אינו זמין", "blob_unavailable");
        files.push({ name: staged.fileName, bytes: Buffer.from(staged.base64, "base64") });
      }
      if (files.length === 0) return jsonBadRequest("חסר קובץ תוכנית", "missing_fields");
      if (files.length > MAX_FILES) return jsonBadRequest("יותר מדי קבצים בהעלאה אחת", "too_many_files");

      const report = await identifyStructure(files);
      const fingerprint = structureFingerprint(files);
      await rememberStructure(orgId, fingerprint, choiceRecordOf(report));
      return NextResponse.json({ report, fingerprint });
    } catch (error) {
      return apiErrorResponse(error, "floorplan identify");
    }
  },
  { rateLimit: { key: "floorplan-viz:identify", limit: 40, windowMs: 60 * 60_000 } },
);
