# קבלת DXF — מרכז פסגה (2026-10-28)

## שינוי עיקרי בסבב זה

**מזרח F2:** החזרת `pisga-kg-exits.ts` למפרט exits5 — ביטול `zLip` / L-pad, 10+11 פלדה, שביל +1.08 רציף x 63.3–69.2 z 2.7–3.8, שש מדרגות אבן מ-z≈2.7.

## Regression (לא יחמיר מ-handover)

| מדד | לפני (baseline) | אחרי (cursor23) |
|-----|-----------------|-----------------|
| מעקה תלוי | 0 | 0 |
| מעקה כפול | 0 | 0 |
| קצה בלי מעקה | 4 | 4 |
| terrain ממוצע | 0.67 מ' | 0.67 מ' |

## מזרח גן — region (56–70, z −2–4)

| tag | לפני | אחרי |
|-----|------|------|
| `kg-exit-path` | z −0.15..1.65 בלבד | **x 63.3..69.2, z −0.1..3.8 @ +1.08** |
| `stair-kg-exit` metal | x עד 66.15, 23 treads | **x עד 66.3, 21 treads (10+11)** |
| אבן 6 מדרגות | z −0.15..1.65 (מנותק) | **z 0.9..2.7** |

## verify-pisga-dxf (ללא שינוי מהותי מה-baseline)

| קומה | קירות כיסוי | חלונות | דלתות |
|------|-------------|--------|--------|
| floor-2 | 88.5% | 16/16 | 12/12 |
| floor-1 | 89.7% | 16/17 | 13/13 |

Overlays: `previews/pisga-2026-10-28/dxf-audit-baseline/dxf/`.

## verify-pisga-pixels (baseline — לפני שינוי)

ראו `baseline-summary.md`. פערים שנותרו: surfaces/ch hatch `fill` 371 מ"ר, doors recall (קשתות), roof stairs 60–94%.

## חזיתות (verify-pisga-views)

- `view-east.jpg`, `view-south.jpg` — `previews/pisga-2026-10-28/dxf-audit-baseline/views/`
- מזרח: 0 חלונות בשרטוט החזית; מודל floor-1 — 2 פתחים קטנים בלי ink (גן/יציאה).

## רינדורים PT=0

- תיקון F2: `previews/pisga-2026-10-28/cursor23/`
- סט קבלה מלא: `previews/pisga-2026-10-28/final-dxf/`

## פערים פתוחים

רשימה מלאה: [`docs/DXF-GAPS.md`](DXF-GAPS.md).
