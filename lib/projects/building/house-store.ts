import { createHash } from "node:crypto";

import { createLogger } from "@/lib/logger";
import { isFloorplanBlobUrl } from "@/lib/projects/floorplan-blob";
import { houseKnob } from "@/lib/projects/building/house-knobs";
import { env } from "@/lib/env";

const log = createLogger("house-store");

/**
 * Where a private-house booklet keeps what must outlive the process: the
 * uploaded sheets, the review's pictures, the finished PDF, and every
 * painting that held its render. In Blob where the server has a token, on
 * this machine's disk otherwise (a local server); a restart of either
 * keeps them.
 */
export type HouseFileStore = {
  kind: "blob" | "disk";
  /** Keep `data` under `path`; answers the reference to fetch it by. */
  put(path: string, data: Buffer, contentType: string): Promise<string>;
  /** The bytes at a reference `put` gave, or at `path`; null when there are none. */
  get(refOrPath: string): Promise<Buffer | null>;
  remove(refs: string[]): Promise<void>;
  /** Removes everything kept under `prefix` but the references in `keep`; answers how many went. */
  removeUnder(prefix: string, keep: string[]): Promise<number>;
};

function blobStore(): HouseFileStore {
  return {
    kind: "blob",
    async put(path, data, contentType) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`house-booklets/${path}`, data, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true });
      return blob.url;
    },
    async get(refOrPath) {
      let url = refOrPath;
      if (!/^https?:\/\//.test(refOrPath)) {
        const { head } = await import("@vercel/blob");
        try {
          url = (await head(`house-booklets/${refOrPath}`)).url;
        } catch {
          return null;
        }
      }
      if (!isFloorplanBlobUrl(url)) return null;
      const res = await fetch(url, { cache: "no-store" });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },
    async remove(refs) {
      const mine = refs.filter(isFloorplanBlobUrl);
      if (!mine.length) return;
      try {
        const { del } = await import("@vercel/blob");
        await del(mine);
      } catch (err: unknown) {
        log.warn("house files not deleted; they will age out", { error: err instanceof Error ? err.message : String(err) });
      }
    },
    async removeUnder(prefix, keep) {
      const { del, list } = await import("@vercel/blob");
      let removed = 0;
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `house-booklets/${prefix}`, cursor, limit: 1000 });
        const gone = page.blobs.map((b) => b.url).filter((url) => !keep.includes(url));
        if (gone.length) await del(gone);
        removed += gone.length;
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return removed;
    },
  };
}

function diskStore(root: string): HouseFileStore {
  const pathOf = async (p: string) => {
    const path = await import("node:path");
    const rel = p.startsWith("file:") ? p.slice(5) : p;
    const full = path.resolve(root, rel);
    if (!full.startsWith(path.resolve(root))) throw new Error("path outside the store");
    return full;
  };
  return {
    kind: "disk",
    async put(p, data) {
      const [{ mkdir, writeFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      const full = await pathOf(p);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
      return `file:${p}`;
    },
    async get(refOrPath) {
      const { readFile } = await import("node:fs/promises");
      try {
        return await readFile(await pathOf(refOrPath));
      } catch {
        return null;
      }
    },
    async remove(refs) {
      const { rm } = await import("node:fs/promises");
      await Promise.all(refs.map(async (r) => rm(await pathOf(r), { force: true }).catch(() => undefined)));
    },
    async removeUnder(prefix, keep) {
      const [{ readdir, rm }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      const dir = await pathOf(prefix);
      const kept = new Set(await Promise.all(keep.map(pathOf)));
      const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
      const gone = entries.map((e) => path.join(e.parentPath, e.name)).filter((f, i) => entries[i]!.isFile() && !kept.has(f));
      await Promise.all(gone.map((f) => rm(f, { force: true })));
      return gone.length;
    },
  };
}

let current: HouseFileStore | null = null;

/** The store this server keeps house booklets in. */
export async function houseFileStore(): Promise<HouseFileStore> {
  if (current) return current;
  if (env.BLOB_READ_WRITE_TOKEN) return (current = blobStore());
  const [os, path] = await Promise.all([import("node:os"), import("node:path")]);
  return (current = diskStore(houseKnob("HOUSE_BOOKLET_DIR") || path.join(os.tmpdir(), "house-booklets")));
}

/** For tests: a store of their own. */
export function setHouseFileStore(store: HouseFileStore | null): void {
  current = store;
}

/** A store kept in memory, for tests. */
export function memoryHouseStore(): HouseFileStore & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    kind: "disk",
    files,
    async put(p, data) {
      files.set(p, data);
      return `file:${p}`;
    },
    async get(refOrPath) {
      return files.get(refOrPath.replace(/^file:/, "")) ?? null;
    },
    async remove(refs) {
      for (const r of refs) files.delete(r.replace(/^file:/, ""));
    },
    async removeUnder(prefix, keep) {
      const kept = new Set(keep.map((r) => r.replace(/^file:/, "")));
      const gone = [...files.keys()].filter((p) => p.startsWith(prefix) && !kept.has(p));
      for (const p of gone) files.delete(p);
      return gone.length;
    },
  };
}

/** A painting's key: the exact render it was painted over, how it was asked for, and by which model. */
export function paintingKey(render: Buffer, prompt: string, model: string): string {
  return createHash("sha256").update(render).update("\u0000").update(prompt).update("\u0000").update(model).digest("hex");
}

/** Paintings that held their renders, by key: a render that has not changed is never paid for twice. */
export type PaintingCache = {
  get(key: string): Promise<Buffer | null>;
  put(key: string, painting: Buffer): Promise<void>;
};

export function paintingCache(store: HouseFileStore): PaintingCache {
  return {
    get: (key) => store.get(`paintings/${key}.jpg`).catch(() => null),
    put: async (key, painting) => {
      await store.put(`paintings/${key}.jpg`, painting, "image/jpeg").catch((err: unknown) => {
        log.warn("painting not kept", { key, error: err instanceof Error ? err.message : String(err) });
      });
    },
  };
}

/**
 * The vision model's answers, by the picture and question asked: the same
 * sheet read again is answered as before. Asked afresh each run, the facades'
 * level marks came back 19 of 23 one run and 20 the next, the site moved by a
 * few centimetres, every view showing the ground had a new render, and
 * paintings already approved were paid for again (Gottlieb A, 12/10/2026).
 */
export type AnswerMemo = {
  get(key: string): Promise<unknown | null>;
  put(key: string, answer: unknown): Promise<void>;
};

export function answerKey(image: Buffer, question: string): string {
  return createHash("sha256").update(image).update("\u0000").update(question).digest("hex");
}

export function answerMemo(store: HouseFileStore): AnswerMemo {
  return {
    get: async (key) => {
      const data = await store.get(`answers/${key}.json`).catch(() => null);
      return data ? (JSON.parse(data.toString("utf8")) as unknown) : null;
    },
    put: async (key, answer) => {
      await store.put(`answers/${key}.json`, Buffer.from(JSON.stringify(answer)), "application/json").catch((err: unknown) => {
        log.warn("answer not kept", { key, error: err instanceof Error ? err.message : String(err) });
      });
    },
  };
}
