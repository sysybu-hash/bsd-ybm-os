# PageSpeed baseline — bsd-ybm.co.il

מדידות אחידות על **`https://www.bsd-ybm.co.il/`** (apex מפנה ל-www ב-`next.config.js`).

## PSI runs (ייחוס)

| Run ID | הערה |
|--------|------|
| `6qqub71p4u` | מדידה ~13:24 |
| `9hn31iugix` | מדידה ~22:26 |

בזמן תכנון התוכנית: PageSpeed API החזיר **429**; ציונים מספריים יש לעדכן ידנית מ-PSI או מהרצת Lighthouse מקומית.

## טבלת מעקב

| תאריך | Strategy | Perf | A11y | BP | SEO | LCP | CLS | TBT | הערות |
|-------|----------|------|------|----|-----|-----|-----|-----|--------|
| 2026-06-04 | mobile (prod, לפני deploy מלא) | 61 | 86 | 100 | 92 | 4619 | 0.000 | 366 | baseline ראשון |
| 2026-06-04 | mobile (prod, אחרי חלק מהשינויים) | 76 | 86 | 100 | 92 | 4000 | 0.000 | 344 | deploy חלקי / נכסים |
| 2026-06-04 | desktop (prod) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | הרץ `--strategy=desktop` |

## הרצה מקומית (ללא מכסת PSI)

```bash
# dev server ברקע
npm run dev

# מובייל + דסקטופ, JSON ב-reports/
LIGHTHOUSE_BASE_URL=https://www.bsd-ybm.co.il npm run lighthouse:sample -- --base=https://www.bsd-ybm.co.il --strategy=mobile --output=reports/lighthouse-www-mobile.json
LIGHTHOUSE_BASE_URL=https://www.bsd-ybm.co.il npm run lighthouse:sample -- --base=https://www.bsd-ybm.co.il --strategy=desktop --output=reports/lighthouse-www-desktop.json

# סף 100% על /
npm run lighthouse:sample -- --base=http://127.0.0.1:3000 --paths=/ --strategy=mobile --fail-on-budget
```

## ממצאי קוד (גורמי ציון נמוך לפני התיקון)

| בעיה | מיקום |
|------|--------|
| Root layout `force-dynamic` + `getServerSession` | `app/layout.tsx` |
| דף נחיתה client-only | `MarketingCinematicPage.tsx` |
| וידאו `preload="auto"` | `VideoBackground.tsx` |
| PostHog ב-mount | `posthog-provider.tsx` |
| SW בכל דף | `app/layout.tsx` |
| סף CI נמוך | `lighthouserc.json` |

## Definition of Done

- Performance, Accessibility, Best Practices, SEO: **100** (mobile + desktop lab)
- LCP ≤ 2.0s, CLS ≤ 0.05, TBT ≤ 150ms (lab)
- `lighthouserc` + workflow: `minScore: 1` על www (ראה `lighthouserc.www.json`)
