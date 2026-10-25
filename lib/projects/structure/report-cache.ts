import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { StructureKind, StructureReport } from "@/lib/validation/schemas/floorplan-structure";

const log = createLogger("floorplan-structure-cache");

/** A run follows its identify within minutes; past this the file is read again. */
const TTL_SEC = 2 * 60 * 60;

/**
 * What the run needs to trust the person's choice: which plans the file
 * holds and which of them cannot be produced. The previews stay with the
 * browser — they are too large for one cache entry and nothing checks them.
 */
export type StructureChoiceRecord = {
  structure: StructureKind;
  sure: boolean;
  planIds: string[];
  blockedPlanIds: string[];
  blockers: string[];
};

/** Identifies the upload: its bytes, in order, and the deployed code that read them. */
export function structureFingerprint(files: Array<{ name: string; bytes: Buffer }>): string {
  const hash = createHash("sha256");
  hash.update(env.VERCEL_GIT_COMMIT_SHA ?? "");
  for (const file of files) {
    hash.update("\n");
    hash.update(file.name);
    hash.update(file.bytes);
  }
  return hash.digest("hex");
}

export function choiceRecordOf(report: StructureReport): StructureChoiceRecord {
  return {
    structure: report.structure,
    sure: report.sure,
    planIds: report.plans.map((p) => p.id),
    blockedPlanIds: report.plans.filter((p) => p.blocked).map((p) => p.id),
    blockers: report.blockers,
  };
}

const key = (orgId: string, fingerprint: string) => `fpstruct:${orgId}:${fingerprint}`;

async function redis() {
  const { getUpstashRedis } = await import("@/lib/upstash-redis");
  return getUpstashRedis();
}

export async function rememberStructure(orgId: string, fingerprint: string, record: StructureChoiceRecord): Promise<void> {
  try {
    const store = await redis();
    if (!store) return;
    await store.set(key(orgId, fingerprint), JSON.stringify(record), { ex: TTL_SEC });
  } catch (err: unknown) {
    log.warn("structure not cached", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function recallStructure(orgId: string, fingerprint: string): Promise<StructureChoiceRecord | null> {
  try {
    const store = await redis();
    if (!store) return null;
    const raw = await store.get(key(orgId, fingerprint));
    if (raw == null) return null;
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as StructureChoiceRecord;
    return Array.isArray(parsed.planIds) ? parsed : null;
  } catch (err: unknown) {
    log.warn("structure cache unreadable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
