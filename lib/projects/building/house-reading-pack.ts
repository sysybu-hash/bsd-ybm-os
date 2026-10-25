/**
 * A model's reading kept between the booklet's steps, small. A public building's strip runs to a million
 * lines, and as plain JSON every line repeats its keys and sixteen digits: Wolf's reading was 251 MB,
 * and parsing it back cost each step over a gigabyte. Long lists of like objects are kept as columns,
 * and numbers to a ten-thousandth of a point (a page unit is 0.35 mm at 1:50; this is under 0.04 mm).
 */

const COLS = "~c";
const ROWS = "~r";
const MISSING = "~u";
/** Lists shorter than this are not worth the columns. */
const LEAST = 32;

const round = (n: number): number => (Number.isInteger(n) ? n : Math.round(n * 1e4) / 1e4);

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function pack(value: unknown): unknown {
  if (typeof value === "number") return round(value);
  if (Array.isArray(value)) {
    if (value.length >= LEAST && value.every(isPlain)) {
      const keys = [...new Set(value.flatMap((o) => Object.keys(o)))];
      const rows: unknown[] = [];
      for (const o of value) for (const k of keys) rows.push(k in o ? (o[k] === undefined ? MISSING : pack(o[k])) : MISSING);
      return { [COLS]: keys, [ROWS]: rows };
    }
    return value.map(pack);
  }
  if (isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = pack(v);
    return out;
  }
  return value;
}

function unpack(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unpack);
  if (!isPlain(value)) return value;
  const keys = value[COLS];
  const rows = value[ROWS];
  if (Array.isArray(keys) && Array.isArray(rows)) {
    const out: Array<Record<string, unknown>> = [];
    for (let i = 0; i < rows.length; i += keys.length) {
      const o: Record<string, unknown> = {};
      for (let j = 0; j < keys.length; j++) {
        const v = rows[i + j];
        if (v !== MISSING) o[keys[j] as string] = unpack(v);
      }
      out.push(o);
    }
    return out;
  }
  for (const k of Object.keys(value)) value[k] = unpack(value[k]);
  return value;
}

export function packHouseReading(reading: unknown): Buffer {
  return Buffer.from(JSON.stringify(pack(reading)));
}

/** Reads a packed reading back, and a plain one stored before packing. */
export function unpackHouseReading<T>(data: Buffer): T {
  return unpack(JSON.parse(data.toString("utf8"))) as T;
}
