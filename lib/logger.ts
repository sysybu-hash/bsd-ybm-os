/**
 * Lightweight logger wrapper.
 *
 * - In development: writes to console for visibility.
 * - In production (browser): forwards to PostHog as a structured event, and
 *   `error` level also goes to Sentry (if NEXT_PUBLIC_SENTRY_DSN is set).
 * - On the server: stays on console so Vercel log drains capture it; `error`
 *   level also goes to Sentry on server runtimes (if SENTRY_DSN is set).
 * - All log fields are automatically redacted for PII (emails, Israeli IDs,
 *   phone numbers, API keys, credit card numbers) before being emitted.
 *
 * Use this instead of `console.*` inside widgets / lib code so that swallowed
 * errors stop disappearing silently.
 */

import * as Sentry from "@sentry/nextjs";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const isBrowser = typeof window !== "undefined";
const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// PII redaction
// ---------------------------------------------------------------------------

/** Patterns that identify sensitive values. Ordered most-specific → least. */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys / bearer tokens — long alphanumeric strings starting with known prefixes
  {
    pattern: /\b(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|ya29\.[A-Za-z0-9_-]{30,})/g,
    replacement: "[API_KEY]",
  },
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[EMAIL]",
  },
  // Israeli ID (Teudat Zehut) — 9 digits (standalone)
  {
    pattern: /\b\d{9}\b/g,
    replacement: "[IL_ID]",
  },
  // Israeli phone numbers: 05x-xxxxxxx or +972-5x-xxxxxxx
  {
    pattern: /(?:\+972[-\s]?|0)(5\d[-\s]?\d{7}|\d{1,2}[-\s]?\d{7})/g,
    replacement: "[PHONE]",
  },
  // Credit card numbers (13–19 digits, optionally separated by spaces/dashes)
  {
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[CC_NUMBER]",
  },
];

/** Recursively redact PII from a string value. */
function redactString(value: string): string {
  let result = value;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Recursively redact PII from log fields (depth-limited to 4 levels). */
function redactFields(value: unknown, depth = 0): unknown {
  if (depth > 4) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactFields(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Completely suppress keys that are explicitly sensitive
      const lower = k.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("apikey") ||
        lower.includes("api_key") ||
        lower.includes("authorization") ||
        lower.includes("credential")
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactFields(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function redact(fields?: Fields): Fields | undefined {
  if (!fields) return undefined;
  return redactFields(fields) as Fields;
}

function postHogCapture(level: Level, scope: string, message: string, fields?: Fields) {
  if (!isBrowser) return;
  try {
    const ph = (window as unknown as { posthog?: { capture?: (e: string, p: Fields) => void } }).posthog;
    ph?.capture?.("client_log", { level, scope, message, ...(fields ?? {}) });
  } catch {
    /* never let telemetry crash the app */
  }
}

function sentryCapture(level: Level, scope: string, message: string, fields?: Fields) {
  try {
    if (level === "error") {
      const err = fields && fields.errorMessage
        ? new Error(`[${scope}] ${message}: ${fields.errorMessage}`)
        : new Error(`[${scope}] ${message}`);
      if (fields && typeof fields.errorStack === "string") err.stack = fields.errorStack;
      Sentry.captureException(err, { tags: { scope }, extra: fields ?? {} });
    } else if (level === "warn") {
      Sentry.captureMessage(`[${scope}] ${message}`, { level: "warning", tags: { scope }, extra: fields ?? {} });
    }
  } catch {
    /* Sentry not configured — never throw from logging */
  }
}

function emit(level: Level, scope: string, message: string, fields?: Fields) {
  // Always redact PII before any output path
  const safeMessage = redactString(message);
  const safeFields = redact(fields);

  if (!isProd) {
    const tag = `[${scope}]`;
    const args: unknown[] = safeFields ? [tag, safeMessage, safeFields] : [tag, safeMessage];
    (console[level] ?? console.log).apply(console, args as []);
    return;
  }
  if (level === "error" || level === "warn") {
    postHogCapture(level, scope, safeMessage, safeFields);
    sentryCapture(level, scope, safeMessage, safeFields);
  }
}

export function createLogger(scope: string) {
  return {
    info: (message: string, fields?: Fields) => emit("info", scope, message, fields),
    warn: (message: string, fields?: Fields) => emit("warn", scope, message, fields),
    error: (message: string, error?: unknown, fields?: Fields) => {
      const errFields: Fields = { ...(fields ?? {}) };
      if (error instanceof Error) {
        errFields.errorMessage = error.message;
        errFields.errorStack = error.stack ?? "";
      } else if (error !== undefined) {
        errFields.error = String(error);
      }
      emit("error", scope, message, errFields);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
