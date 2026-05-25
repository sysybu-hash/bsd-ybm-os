import type { FieldCopilotAsset, FieldCopilotSession } from "@prisma/client";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

export function mapSessionToDraft(
  session: FieldCopilotSession,
  assets: FieldCopilotAsset[],
): FieldCopilotDraft {
  const photoAssetIds = assets.filter((a) => a.kind === "photo" || a.kind === "keyframe").map((a) => a.id);
  const assumptionsRaw = session.assumptionsJson;
  const assumptions = Array.isArray(assumptionsRaw)
    ? assumptionsRaw.filter((x): x is string => typeof x === "string")
    : [];

  return {
    id: session.id,
    organizationId: session.organizationId,
    userId: session.userId,
    contactId: session.contactId,
    contactName: session.contactName,
    projectId: session.projectId,
    projectName: session.projectName,
    constructionTrade: session.constructionTrade,
    capture: {
      transcript: session.transcript ?? undefined,
      photoAssetIds,
      videoAssetId: session.videoAssetId ?? undefined,
      userNotes: session.userNotes ?? undefined,
    },
    analysis: session.analysisJson as Record<string, unknown> | null | undefined,
    scopeSummary: session.scopeSummary,
    assumptions,
    status: session.status,
  };
}

export function parseAnalysisJson(raw: unknown): ScanExtractionV5 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 5) return null;
  return raw as ScanExtractionV5;
}
