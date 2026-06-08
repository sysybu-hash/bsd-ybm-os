import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Replay SDK (~40 KB) disabled — costs too much on initial bundle for marginal value.
    // Re-enable replaysOnErrorSampleRate when Sentry Replay is needed for debugging.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [],
    beforeSend(event) {
      if (process.env.NODE_ENV !== "production") {
        if (event.level && event.level !== "error" && event.level !== "fatal") return null;
      }
      return event;
    },
  });
}
