/**
 * Lightweight logger wrapper.
 *
 * - In development: writes to console for visibility.
 * - In production (browser): forwards to PostHog as a structured event, and
 *   `error` level also goes to Sentry (if NEXT_PUBLIC_SENTRY_DSN is set).
 * - On the server: stays on console so Vercel log drains capture it; `error`
 *   level also goes to Sentry on server runtimes (if SENTRY_DSN is set).
 *
 * Use this instead of `console.*` inside widgets / lib code so that swallowed
 * errors stop disappearing silently.
 */

import * as Sentry from "@sentry/nextjs";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const isBrowser = typeof window !== "undefined";
const isProd = process.env.NODE_ENV === "production";

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
  if (!isProd) {
    const tag = `[${scope}]`;
    const args: unknown[] = fields ? [tag, message, fields] : [tag, message];
    (console[level] ?? console.log).apply(console, args as []);
    return;
  }
  if (level === "error" || level === "warn") {
    postHogCapture(level, scope, message, fields);
    sentryCapture(level, scope, message, fields);
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
