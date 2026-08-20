/**
 * תור סריקות אופליין (IndexedDB). כשסריקה נכשלת מחוסר רשת (אתר בנייה),
 * הקובץ + פרמטרי הסריקה נשמרים מקומית ומסתנכרנים כשהרשת חוזרת.
 * מימוש IndexedDB גולמי — ללא תלות חיצונית.
 */

export const SCAN_OUTBOX_DB = "bsd-ybm-scan-outbox";
export const SCAN_OUTBOX_STORE = "queue";
const DB_VERSION = 1;

/** מכסת נפח מצטברת — מונע מילוי דיסק בשטח ללא רשת ממושכת. */
export const SCAN_OUTBOX_MAX_BYTES = 50 * 1024 * 1024; // 50MB

export type ScanOutboxRecord = {
  id: string;
  fileBlob: Blob;
  fileName: string;
  fileType: string;
  fileSize: number;
  scanMode: string;
  engineRunMode: string;
  projectId: string | null;
  userInstruction: string | null;
  createdAt: number;
};

export type ScanOutboxInput = Omit<ScanOutboxRecord, "id" | "createdAt" | "fileSize">;

/** בונה רשומת תור מקלט סריקה (טהור — נבדק ביחידה). */
export function buildOutboxRecord(input: ScanOutboxInput, now: number = Date.now()): ScanOutboxRecord {
  return {
    ...input,
    id: `outbox-${now}-${Math.random().toString(36).slice(2, 9)}`,
    fileSize: input.fileBlob.size,
    createdAt: now,
  };
}

/**
 * מזהה כשל-רשת (אופליין) להבדיל מכשל-שרת. TypeError מ-fetch, navigator.offline,
 * או הודעות רשת מוכרות — כן; 4xx/5xx מהשרת — לא.
 */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch network failure
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  );
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SCAN_OUTBOX_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCAN_OUTBOX_STORE)) {
        db.createObjectStore(SCAN_OUTBOX_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb open failed"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(SCAN_OUTBOX_STORE, mode);
        const store = t.objectStore(SCAN_OUTBOX_STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexeddb tx failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

export async function countOutboxBytes(): Promise<number> {
  const all = await listOutbox();
  return all.reduce((sum, r) => sum + (r.fileSize || 0), 0);
}

/** מוסיף רשומה לתור. זורק אם המכסה תיחרג. */
export async function enqueueScan(input: ScanOutboxInput): Promise<ScanOutboxRecord> {
  if (!hasIndexedDb()) throw new Error("indexeddb unavailable");
  const used = await countOutboxBytes();
  if (used + input.fileBlob.size > SCAN_OUTBOX_MAX_BYTES) {
    throw new Error("scan_outbox_quota_exceeded");
  }
  const record = buildOutboxRecord(input);
  await tx("readwrite", (store) => store.put(record));
  return record;
}

export async function listOutbox(): Promise<ScanOutboxRecord[]> {
  if (!hasIndexedDb()) return [];
  const all = await tx<ScanOutboxRecord[]>("readonly", (store) => store.getAll());
  return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function countOutbox(): Promise<number> {
  if (!hasIndexedDb()) return 0;
  return tx<number>("readonly", (store) => store.count());
}

export async function removeFromOutbox(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await tx("readwrite", (store) => store.delete(id));
}

export async function clearOutbox(): Promise<void> {
  if (!hasIndexedDb()) return;
  await tx("readwrite", (store) => store.clear());
}

/**
 * מסנכרן את התור: לכל רשומה קורא ל-submit; מסיר בהצלחה, עוצר בכשל-רשת ראשון
 * (כדי לא לרוקן מול רשת שנפלה שוב). מחזיר כמה סונכרנו וכמה נותרו.
 */
export async function flushScanOutbox(
  submit: (record: ScanOutboxRecord) => Promise<void>,
): Promise<{ synced: number; remaining: number }> {
  const queued = await listOutbox();
  let synced = 0;
  for (const record of queued) {
    try {
      await submit(record);
      await removeFromOutbox(record.id);
      synced += 1;
    } catch (err) {
      if (isNetworkError(err)) break; // רשת נפלה שוב — נשאיר את השאר לתור הבא
      // כשל-שרת אמיתי (קובץ פגום וכו') — הסר כדי לא להיתקע בלולאה
      await removeFromOutbox(record.id);
    }
  }
  return { synced, remaining: await countOutbox() };
}
