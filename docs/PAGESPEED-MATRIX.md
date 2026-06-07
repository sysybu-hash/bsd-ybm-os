# PageSpeed Matrix — bsd-ybm.co.il

עודכן: **2026-06-07** · מקור: `C:\Users\User\Desktop\BSD-YBM-OS\reports\pagespeed\post-deploy`

## טבלת ציונים

| נתיב | שכבה | עדיפות | אסטרטגיה | Perf | A11y | BP | SEO | LCP | TBT |
|------|------|--------|----------|------|------|----|-----|-----|-----|
| / | public | P0 | mobile | 99 | 97 | 100 | 100 | 1447 | 80 |
| / | public | P0 | desktop | 68 | 97 | 100 | 100 | 4736 | 90 |
| /login | public | P0 | mobile | 95 | 100 | 100 | 91 | 2857 | 74 |
| /login | public | P0 | desktop | 70 | 100 | 100 | 91 | 4142 | 163 |
| /login?mode=register | public | P0 | mobile | 94 | 100 | 100 | 91 | 3012 | 65 |
| /login?mode=register | public | P0 | desktop | 76 | 100 | 100 | 91 | 2954 | 135 |

## מתחת ל-100

- **/** (mobile): performance:99, accessibility:97
  - mainthread-work-breakdown: Minimize main-thread work (0)
  - color-contrast: Background and foreground colors do not have a sufficient contrast ratio. (0)
  - unused-css-rules: Reduce unused CSS (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - render-blocking-insight: Render blocking requests (0)
  - unused-javascript: Reduce unused JavaScript (50)
  - legacy-javascript-insight: Legacy JavaScript (50)
  - interactive: Time to Interactive (81)
- **/** (desktop): performance:68, accessibility:97
  - mainthread-work-breakdown: Minimize main-thread work (0)
  - color-contrast: Background and foreground colors do not have a sufficient contrast ratio. (0)
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - largest-contentful-paint: Largest Contentful Paint (10)
  - speed-index: Speed Index (37)
- **/login** (mobile): performance:95, seo:91
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-css-rules: Reduce unused CSS (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - render-blocking-insight: Render blocking requests (0)
- **/login** (desktop): performance:70, seo:91
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - largest-contentful-paint: Largest Contentful Paint (15)
  - legacy-javascript-insight: Legacy JavaScript (50)
- **/login?mode=register** (mobile): performance:94, seo:91
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - legacy-javascript-insight: Legacy JavaScript (50)
  - render-blocking-insight: Render blocking requests (50)
- **/login?mode=register** (desktop): performance:76, seo:91
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - largest-contentful-paint: Largest Contentful Paint (35)
  - legacy-javascript-insight: Legacy JavaScript (50)

## הרצה

```bash
npm run lighthouse:matrix:prod -- --tier=public --priority=P0 --strategy=both
npm run lighthouse:auth-setup -- --base=http://127.0.0.1:3000
npm run lighthouse:matrix -- --base=http://127.0.0.1:3000 --tier=auth --priority=P0
npm run lighthouse:report
```
