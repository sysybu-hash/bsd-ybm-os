/** Escape a CSV cell value (RFC-style). */
export function csvEscape(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map((v) => csvEscape(v)).join(",");
}
