/**
 * app/opengraph-image.tsx
 * Root dynamic Open Graph image (1200×630) generated at request-time via next/og.
 * Used by the root layout and any page without a more specific opengraph-image.
 *
 * Accessible at: GET /opengraph-image
 * Referenced automatically by Next.js metadata system.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BSD-YBM Intelligence — מערכת ניהול עסקים ויזמות";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default function RootOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0c10 0%, #0f172a 50%, #0a0c10 100%)",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow accents */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "64px 80px",
            justifyContent: "space-between",
          }}
        >
          {/* Top: Logo area */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 700,
                color: "white",
              }}
            >
              B
            </div>
            <span style={{ color: "#94a3b8", fontSize: 22, fontWeight: 600, letterSpacing: 1 }}>
              BSD-YBM Intelligence
            </span>
          </div>

          {/* Middle: Headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                fontSize: 62,
                fontWeight: 800,
                color: "white",
                lineHeight: 1.1,
                letterSpacing: -1,
              }}
            >
              מערכת הפעלה לעסקים בישראל
            </div>
            <div
              style={{
                fontSize: 28,
                color: "#64748b",
                fontWeight: 400,
                maxWidth: 760,
                lineHeight: 1.4,
              }}
            >
              לקוחות · מסמכים · AI · חיוב · דוחות — במקום אחד
            </div>
          </div>

          {/* Bottom: Feature pills */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {["AI רב-מנועי", "חתימה דיגיטלית", "PayPlus / PayPal", "WebAuthn Passkeys", "ישראלי-100%"].map((f) => (
              <div
                key={f}
                style={{
                  background: "rgba(99,102,241,0.12)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  borderRadius: 100,
                  padding: "10px 22px",
                  color: "#a5b4fc",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
