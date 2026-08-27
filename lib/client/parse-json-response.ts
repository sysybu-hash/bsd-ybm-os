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

/**
 * Turn an API error body into text in the user's language.
 *
 * Every helper in `lib/api-json.ts` emits `{ error, code }`, and `code` is
 * stable and machine-readable while `error` is a hard-coded Hebrew string. There
 * are ~130 distinct codes against ~850 hard-coded messages, so translating by
 * code is an order of magnitude less work than migrating every call site — and
 * it puts the decision on the client, which knows the user's locale for certain
 * rather than guessing from Accept-Language.
 *
 * Falls back to the server's own message when the code has no translation, so an
 * unmapped or brand-new code shows exactly what it shows today. That fallback is
 * what makes adopting this safe to do gradually. Four codes are deliberately
 * unmapped because the server interpolates a value into the message that the
 * code alone cannot carry.
 */
export function resolveApiErrorMessage(
  body: { error?: unknown; code?: unknown; vars?: unknown } | undefined,
  t: (key: string) => string,
  fallback?: string,
): string {
  const serverMessage = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  if (code) {
    const key = `apiErrors.${code}`;
    const translated = t(key);
    // useI18n returns the key itself when there is no entry for it.
    if (translated && translated !== key) return interpolate(translated, body?.vars);
  }
  return serverMessage ?? fallback ?? t("common.errors.unknown");
}

/**
 * Fills `{name}` placeholders from the error body's `vars`.
 *
 * Errors that name a value — the rejected MIME type, the document number
 * already in use — used to be built server-side as Hebrew template literals,
 * which is why they could not be translated from the code alone. The server
 * sends the values now and the translation supplies the sentence.
 */
function interpolate(text: string, vars: unknown): string {
  if (!vars || typeof vars !== "object") return text;
  let out = text;
  for (const [name, value] of Object.entries(vars as Record<string, unknown>)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
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
