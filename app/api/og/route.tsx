/**
 * app/api/og/route.tsx
 * Generates dynamic Open Graph images for shareable pages.
 *
 * Usage:
 *   /api/og?title=הצעת+מחיר&subtitle=פרויקט+גדר+2024&type=invoice
 *
 * Query params:
 *   title   — main headline (up to ~50 chars, required)
 *   subtitle — secondary line (optional)
 *   type    — context badge: "invoice" | "quote" | "project" | "document" | "default"
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

const TYPE_CONFIG: Record<string, { label: string; accent: string }> = {
  invoice: { label: "חשבונית", accent: "#10b981" },
  quote:   { label: "הצעת מחיר", accent: "#6366f1" },
  project: { label: "פרויקט", accent: "#f59e0b" },
  document:{ label: "מסמך", accent: "#64748b" },
  default: { label: "BSD-YBM", accent: "#6366f1" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title    = (searchParams.get("title") ?? "BSD-YBM Intelligence").slice(0, 60);
  const subtitle = (searchParams.get("subtitle") ?? "").slice(0, 80);
  const typeKey  = searchParams.get("type") ?? "default";
  const { label, accent } = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG["default"]!;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: 1200,
          height: 630,
          background: "linear-gradient(135deg, #0a0c10 0%, #0f172a 60%, #0a0c10 100%)",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "60px 80px",
            justifyContent: "space-between",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${accent}, ${accent}aa)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "white",
                }}
              >
                B
              </div>
              <span style={{ color: "#94a3b8", fontSize: 20, fontWeight: 600 }}>
                BSD-YBM Intelligence
              </span>
            </div>
            <div
              style={{
                background: `${accent}22`,
                border: `1px solid ${accent}55`,
                borderRadius: 100,
                padding: "8px 20px",
                color: accent,
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              {label}
            </div>
          </div>

          {/* Main content */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                color: "white",
                lineHeight: 1.15,
                letterSpacing: -0.5,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 28,
                  color: "#64748b",
                  fontWeight: 400,
                  lineHeight: 1.4,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#334155",
              fontSize: 16,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: accent,
              }}
            />
            <span>bsd-ybm.co.il</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
