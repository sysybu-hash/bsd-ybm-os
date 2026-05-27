/** קורא גוף תגובה כ-JSON בלי לזרוק על גוף ריק / HTML מ-500 */
export async function parseJsonResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response,
): Promise<{ ok: boolean; status: number; data: T }> {
  const text = await res.text();
  if (!text.trim()) {
    const fallback = {
      error: res.ok ? undefined : `שגיאת שרת (${res.status})`,
    } as T;
    return { ok: res.ok, status: res.status, data: fallback };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    const fallback = {
      error: `תגובת שרת לא תקינה (${res.status})`,
    } as T;
    return { ok: false, status: res.status, data: fallback };
  }
}
