/**
 * app/opengraph-image.tsx
 * Root dynamic Open Graph image (1200×630) generated at request-time via next/og.
 * Used by the root layout and any page without a more specific opengraph-image.
 *
 * Accessible at: GET /opengraph-image
 * Referenced automatically by Next.js metadata system.
 *
 * NOTE: Satori (the rendering engine) requires an explicit Hebrew font to correctly
 * render RTL text. Without it, Hebrew characters appear in reversed (LTR) order.
 * We fetch Heebo Bold from Google Fonts CDN at request-time and pass it to
 * ImageResponse so Satori can properly shape Hebrew glyphs.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BSD-YBM Intelligence — מערכת ניהול עסקים ויזמות";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

/** טעינת פונט Heebo Bold מ-Google Fonts לצורך רנדור עברית תקין ב-Satori */
async function loadHeeboFont(): Promise<ArrayBuffer | null> {
  try {
    const url =
      "https://fonts.gstatic.com/s/heebo/v26/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSysd0mm_00.woff2";
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function RootOgImage() {
  const heeboData = await loadHeeboFont();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0c10 0%, #0f172a 50%, #0a0c10 100%)",
          fontFamily: "Heebo, sans-serif",
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

        {/* Main content — direction:rtl חיוני כדי ש-Satori ירנדר עברית נכון */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "64px 80px",
            justifyContent: "space-between",
            direction: "rtl",
          }}
        >
          {/* Top: Logo area — LTR כי יש אנגלית בלבד */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, direction: "ltr" }}>
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

          {/* Middle: Headline — RTL לעברית */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, direction: "rtl" }}>
            <div
              style={{
                fontSize: 62,
                fontWeight: 800,
                color: "white",
                lineHeight: 1.1,
                letterSpacing: -1,
                direction: "rtl",
                textAlign: "right",
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
                direction: "rtl",
                textAlign: "right",
              }}
            >
              לקוחות · מסמכים · AI Hub · מחולל · חיוב — במקום אחד
            </div>
          </div>

          {/* Bottom: Feature pills — flexDirection:row-reverse כדי שה-pills יהיו בסדר RTL */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flexDirection: "row-reverse" }}>
            {["AI Hub + מחולל", "חתימה דיגיטלית", "PayPlus / PayPal", "WebAuthn Passkeys", "ישראלי-100%"].map((f) => (
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
                  direction: "rtl",
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // פונט Heebo — חיוני כדי ש-Satori ירנדר עברית בסדר הנכון (RTL text shaping)
      fonts: heeboData
        ? [
            { name: "Heebo", data: heeboData, style: "normal" as const, weight: 800 },
          ]
        : [],
    },
  );
}
