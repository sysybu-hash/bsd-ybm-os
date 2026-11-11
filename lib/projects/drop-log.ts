/**
 * One tally for every reader/builder filter that leaves something out.
 *
 * A filter that drops a piece calls `noteDrop("file:what", sample)`. Nothing
 * here changes what is built — it only makes the leaving-out countable, so a
 * run can print what each filter removed (and a script can stop when a thin
 * part like a mullion or a rail went missing). Learned the hard way: an area
 * floor of 0.05 m² once removed ~1,900 window profiles with no message.
 *
 * The tally is process-wide (diagnostics only). Scripts call `resetDrops()`
 * before a read and `formatDropReport()` after it.
 */

export type DropEntry = {
  /** "<file>:<what>", e.g. "dxf-drawing:unsupported-entity". */
  filter: string;
  count: number;
  /** The first few dropped items, described briefly (type, layer, size). */
  samples: string[];
};

const MAX_SAMPLES = 6;

type Store = Map<string, DropEntry>;

function store(): Store {
  const g = globalThis as unknown as { __bsdDropLog?: Store };
  if (!g.__bsdDropLog) g.__bsdDropLog = new Map();
  return g.__bsdDropLog;
}

/** Count one (or `n`) dropped item(s) under `filter`; `sample` is built only while samples are still kept. */
export function noteDrop(filter: string, sample?: string | (() => string), n = 1): void {
  if (n <= 0) return;
  const s = store();
  let entry = s.get(filter);
  if (!entry) {
    entry = { filter, count: 0, samples: [] };
    s.set(filter, entry);
  }
  entry.count += n;
  if (sample !== undefined && entry.samples.length < MAX_SAMPLES) {
    entry.samples.push(typeof sample === "function" ? sample() : sample);
  }
}

/** Every filter that dropped something since the last reset, most first. */
export function dropReport(): DropEntry[] {
  return [...store().values()].sort((a, b) => b.count - a.count);
}

export function resetDrops(): void {
  store().clear();
}

/** A plain-text table of the report (one line per filter, with samples). */
export function formatDropReport(entries: DropEntry[] = dropReport()): string {
  if (!entries.length) return "nothing dropped";
  return entries
    .map((e) => `${String(e.count).padStart(7)}  ${e.filter}${e.samples.length ? `\n         e.g. ${e.samples.join(" | ")}` : ""}`)
    .join("\n");
}

/** A short size label for samples: "0.42×0.05 m". */
export function sizeLabel(w: number, h: number, unit = "m"): string {
  const f = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  return `${f(w)}×${f(h)} ${unit}`;
}
