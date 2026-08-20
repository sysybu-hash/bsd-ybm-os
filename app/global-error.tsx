"use client";

import { useEffect } from "react";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    void import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureException(error, { tags: { scope: "global-error" } });
      })
      .catch(() => {
        /* Sentry not configured */
      });
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      // חריגה מכללי הלוגר: global-error מחליף את ה-root layout כולו, ולכן
      // createLogger והתשתית סביבו אינם זמינים כאן. dev בלבד.
      console.error("[global-error]", error);
    }
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0d12",
          color: "#e7e9ee",
          fontFamily: "system-ui, -apple-system, 'Heebo', sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: "0.75rem" }}>
              אירעה תקלה כללית
            </h1>
            <p style={{ fontSize: "0.95rem", color: "#9aa3b2", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              המערכת נתקלה בשגיאה לא צפויה. נסו לרענן את הדף או חזרו אלינו בעוד כמה רגעים.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#4f46e5",
                color: "white",
                border: 0,
                borderRadius: "0.75rem",
                padding: "0.75rem 1.5rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              נסה שוב
            </button>
          </div>
      </body>
    </html>
  );
}
