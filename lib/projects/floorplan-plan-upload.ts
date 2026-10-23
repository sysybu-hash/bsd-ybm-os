import { randomUUID } from "node:crypto";

import { PLAN_UPLOAD_MAX_BYTES, PLAN_UPLOAD_PART_BYTES } from "@/lib/projects/plan-upload-limits";
import { inferMimeFromFileName } from "@/lib/scan-mime";
import { sniffFloorplanMime } from "@/lib/projects/photo-prep/mime";

export { PLAN_UPLOAD_MAX_BYTES, PLAN_UPLOAD_PART_BYTES };
const TTL_SEC = 20 * 60;
const MAX_PARTS = Math.ceil(PLAN_UPLOAD_MAX_BYTES / PLAN_UPLOAD_PART_BYTES) + 1;
const READ_CONCURRENCY = 6;

export type PlanUploadStore = {
  set(key: string, value: string, ttlSec: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(keys: string[]): Promise<void>;
  exists(keys: string[]): Promise<number>;
};

export type StagedPlanBytes = {
  base64: string;
  mimeType: string;
  fileName: string;
  bytes: number;
};

type UploadMeta = {
  fileName: string;
  totalBytes: number;
  totalParts: number;
};

let storeOverride: PlanUploadStore | null = null;

/** Tests inject a memory store so a suite never talks to Redis. */
export function __setPlanUploadStoreForTests(store: PlanUploadStore | null) {
  storeOverride = store;
}

export function memoryPlanUploadStore(): PlanUploadStore {
  const rows = new Map<string, string>();
  return {
    async set(key, value) {
      rows.set(key, value);
    },
    async get(key) {
      return rows.get(key) ?? null;
    },
    async del(keys) {
      for (const key of keys) rows.delete(key);
    },
    async exists(keys) {
      return keys.filter((key) => rows.has(key)).length;
    },
  };
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return null;
}

async function store(): Promise<PlanUploadStore | null> {
  if (storeOverride) return storeOverride;
  const { getUpstashRedis } = await import("@/lib/upstash-redis");
  const redis = getUpstashRedis();
  if (!redis) return null;
  return {
    async set(key, value, ttlSec) {
      await redis.set(key, value, { ex: ttlSec });
    },
    async get(key) {
      return asText(await redis.get(key));
    },
    async del(keys) {
      if (keys.length > 0) await redis.del(...keys);
    },
    async exists(keys) {
      if (keys.length === 0) return 0;
      return Number(await redis.exists(...keys));
    },
  };
}

function metaKey(orgId: string, id: string) {
  return `fpup:${orgId}:${id}:meta`;
}

function partKey(orgId: string, id: string, index: number) {
  return `fpup:${orgId}:${id}:p:${index}`;
}

function keysOf(orgId: string, id: string, totalParts: number) {
  return [metaKey(orgId, id), ...Array.from({ length: totalParts }, (_, i) => partKey(orgId, id, i))];
}

export function isPlanUploadId(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

const PART_PREFIX = "b64:";

function readMeta(raw: unknown): UploadMeta | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<UploadMeta>;
    if (
      typeof parsed.fileName !== "string" ||
      !Number.isInteger(parsed.totalBytes) ||
      !Number.isInteger(parsed.totalParts)
    ) {
      return null;
    }
    return {
      fileName: parsed.fileName,
      totalBytes: parsed.totalBytes!,
      totalParts: parsed.totalParts!,
    };
  } catch {
    return null;
  }
}

export async function beginPlanUpload(input: {
  orgId: string;
  fileName: string;
  totalBytes: number;
  totalParts: number;
}): Promise<string | null> {
  try {
    const backend = await store();
    if (!backend) return null;
    const fileName = input.fileName.trim().slice(0, 180) || "plan";
    const { totalBytes, totalParts } = input;
    const expected = Math.ceil(totalBytes / PLAN_UPLOAD_PART_BYTES);
    if (
      !Number.isInteger(totalBytes) ||
      totalBytes <= 0 ||
      totalBytes > PLAN_UPLOAD_MAX_BYTES ||
      !Number.isInteger(totalParts) ||
      totalParts !== expected ||
      totalParts > MAX_PARTS
    ) {
      return null;
    }
    const id = randomUUID();
    const meta: UploadMeta = { fileName, totalBytes, totalParts };
    await backend.set(metaKey(input.orgId, id), JSON.stringify(meta), TTL_SEC);
    return id;
  } catch (error) {
    console.error("plan_upload_begin_failed", error instanceof Error ? error.message : "failed");
    return null;
  }
  orgId: string;
  uploadId: string;
  index: number;
  bytes: Buffer;
}): Promise<boolean> {
  try {
    const backend = await store();
    if (!backend || !isPlanUploadId(input.uploadId)) return false;
    const meta = readMeta(await backend.get(metaKey(input.orgId, input.uploadId)));
    if (!meta || !Number.isInteger(input.index) || input.index < 0 || input.index >= meta.totalParts) {
      return false;
    }
    const isLast = input.index === meta.totalParts - 1;
    const max = isLast ? meta.totalBytes - PLAN_UPLOAD_PART_BYTES * (meta.totalParts - 1) : PLAN_UPLOAD_PART_BYTES;
    if (input.bytes.byteLength !== max || max <= 0) return false;
    await backend.set(
      partKey(input.orgId, input.uploadId, input.index),
      PART_PREFIX + input.bytes.toString("base64"),
      TTL_SEC,
    );
    return true;
  } catch (error) {
    console.error("plan_upload_part_failed", error instanceof Error ? error.message : "failed");
    return false;
  }
}

/** Read every part back into one drawing. Leaves the parts in place for a second read. */
export async function readPlanUpload(orgId: string, uploadId: string): Promise<StagedPlanBytes | null> {
  try {
    const backend = await store();
    if (!backend || !isPlanUploadId(uploadId)) return null;
    const meta = readMeta(await backend.get(metaKey(orgId, uploadId)));
    if (!meta) return null;
    const parts: Array<Buffer | null> = new Array(meta.totalParts).fill(null);
    let cursor = 0;
    let broken = false;
    const workers = Math.min(READ_CONCURRENCY, meta.totalParts);
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (!broken) {
          const index = cursor;
          cursor += 1;
          if (index >= meta.totalParts) return;
          const raw = await backend.get(partKey(orgId, uploadId, index));
          if (typeof raw !== "string" || !raw.startsWith(PART_PREFIX)) {
            broken = true;
            return;
          }
          parts[index] = Buffer.from(raw.slice(PART_PREFIX.length), "base64");
        }
      }),
    );
    if (broken || parts.some((part) => part == null)) return null;
    const bytes = Buffer.concat(parts as Buffer[]);
    if (bytes.byteLength !== meta.totalBytes || bytes.byteLength > PLAN_UPLOAD_MAX_BYTES) return null;
    const base64 = bytes.toString("base64");
    return {
      base64,
      fileName: meta.fileName,
      bytes: bytes.byteLength,
      mimeType: sniffFloorplanMime(base64, inferMimeFromFileName(meta.fileName, "")),
    };
  } catch {
    return null;
  }
}

/** Every part is present. Does not download the drawing. */
export async function planUploadReady(orgId: string, uploadId: string): Promise<boolean> {
  try {
    const backend = await store();
    if (!backend || !isPlanUploadId(uploadId)) return false;
    const meta = readMeta(await backend.get(metaKey(orgId, uploadId)));
    if (!meta || meta.totalParts <= 0) return false;
    const keys = Array.from({ length: meta.totalParts }, (_, index) => partKey(orgId, uploadId, index));
    return (await backend.exists(keys)) === meta.totalParts;
  } catch {
    return false;
  }
}

export async function deletePlanUpload(orgId: string, uploadId: string): Promise<void> {
  try {
    const backend = await store();
    if (!backend || !isPlanUploadId(uploadId)) return;
    const meta = readMeta(await backend.get(metaKey(orgId, uploadId)));
    await backend.del(keysOf(orgId, uploadId, meta?.totalParts ?? 0));
  } catch {
    /* a leftover part expires on its own */
  }
}
