/** Parses response body as JSON; tolerates empty body or HTML error pages. */
export type ParseJsonResult<T extends Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data: T | undefined;
  /** Set when the body is empty or not valid JSON/object. */
  parseError?: string;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function parseJsonResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response,
): Promise<ParseJsonResult<T>> {
  const text = await res.text();
  if (!text.trim()) {
    const parseError = res.ok ? undefined : `שגיאת שרת (${res.status})`;
    return { ok: res.ok, status: res.status, data: undefined, parseError };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (isJsonObject(parsed)) {
      return { ok: res.ok, status: res.status, data: parsed as T };
    }
    return {
      ok: false,
      status: res.status,
      data: undefined,
      parseError: `תגובת שרת לא תקינה (${res.status})`,
    };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: undefined,
      parseError: `תגובת שרת לא תקינה (${res.status})`,
    };
  }
}
