import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { recordFloorplanSpend, type FloorplanSpend } from "@/lib/projects/floorplan-spend";

const log = createLogger("floorplan-dwg-convert");

/**
 * DWG in, DXF out.
 *
 * DWG is a closed format. The only open reader is GPL-licensed, which this
 * product cannot ship, so a DWG upload is converted by CloudConvert and the
 * DXF that comes back is read by the pipeline's own parser. Without a key the
 * caller is told to export the drawing as DXF, which every CAD program does.
 */
const API = "https://api.cloudconvert.com/v2";
const CONVERT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export class DwgConversionUnavailableError extends Error {
  constructor() {
    super("המרת DWG אינה מוגדרת — שמרו את השרטוט כ-DXF והעלו אותו");
    this.name = "DwgConversionUnavailableError";
  }
}

export function isDwgConversionConfigured(): boolean {
  return Boolean(env.CLOUDCONVERT_API_KEY?.trim());
}

type JobTask = {
  name?: string;
  status?: string;
  result?: { files?: Array<{ url?: string }> };
};

function taskFiles(tasks: JobTask[]): string[] {
  const out: string[] = [];
  for (const task of tasks) {
    for (const file of task.result?.files ?? []) {
      if (file.url) out.push(file.url);
    }
  }
  return out;
}

async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CLOUDCONVERT_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`CloudConvert ${path} answered ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Convert DWG bytes to DXF text. Throws when the service is not configured, so
 * the route can tell the user what to do instead of failing silently.
 */
export async function dwgToDxf(
  bytes: Buffer | Uint8Array,
  options?: { spend?: FloorplanSpend; timeoutMs?: number },
): Promise<string | null> {
  if (!isDwgConversionConfigured()) throw new DwgConversionUnavailableError();
  const deadline = Date.now() + (options?.timeoutMs ?? CONVERT_TIMEOUT_MS);
  try {
    const created = await call("/jobs", {
      method: "POST",
      body: JSON.stringify({
        tasks: {
          "import-dwg": { operation: "import/upload" },
          "convert-dwg": {
            operation: "convert",
            input: "import-dwg",
            input_format: "dwg",
            output_format: "dxf",
          },
          "export-dxf": { operation: "export/url", input: "convert-dwg" },
        },
      }),
    });
    const job = (created.data ?? {}) as { id?: string; tasks?: JobTask[] };
    const upload = (job.tasks ?? []).find((task) => task.name === "import-dwg") as
      | { result?: { form?: { url?: string; parameters?: Record<string, string> } } }
      | undefined;
    const form = upload?.result?.form;
    if (!job.id || !form?.url) throw new Error("CloudConvert did not offer an upload form");

    const body = new FormData();
    for (const [key, value] of Object.entries(form.parameters ?? {})) body.append(key, value);
    body.append("file", new Blob([Buffer.from(bytes)]), "drawing.dwg");
    const uploaded = await fetch(form.url, { method: "POST", body });
    if (!uploaded.ok) throw new Error(`CloudConvert upload answered ${uploaded.status}`);

    while (Date.now() < deadline) {
      const polled = await call(`/jobs/${job.id}`, { method: "GET" });
      const data = (polled.data ?? {}) as { status?: string; tasks?: JobTask[] };
      if (data.status === "error") throw new Error("CloudConvert job failed");
      if (data.status === "finished") {
        const url = taskFiles(data.tasks ?? [])[0];
        if (!url) throw new Error("CloudConvert finished without a file");
        const dxf = await fetch(url);
        if (!dxf.ok) throw new Error(`CloudConvert download answered ${dxf.status}`);
        if (options?.spend) recordFloorplanSpend(options.spend, "extract", "cloudconvert-dwg");
        return await dxf.text();
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error("CloudConvert did not finish in time");
  } catch (err: unknown) {
    if (err instanceof DwgConversionUnavailableError) throw err;
    log.warn("dwg conversion failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
