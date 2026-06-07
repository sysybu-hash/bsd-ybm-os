# PageSpeed Matrix — bsd-ybm.co.il

עודכן: **2026-06-07** · מקור: `C:\Users\User\Desktop\BSD-YBM-OS\reports\pagespeed`

## טבלת ציונים

| נתיב | שכבה | עדיפות | אסטרטגיה | Perf | A11y | BP | SEO | LCP | TBT |
|------|------|--------|----------|------|------|----|-----|-----|-----|
| / | public | P0 | desktop | 67 | 97 | 100 | 100 | 4900 | 76 |
| /login | public | P0 | desktop | 75 | 100 | 100 | 91 | 2957 | 81 |
| /register | public | P0 | desktop | 65 | 100 | 100 | 91 | 5269 | 8 |
| / | public | P0 | mobile | 99 | 97 | 100 | 100 | 1599 | 66 |
| /login | public | P0 | mobile | 97 | 100 | 100 | 91 | 2411 | 111 |
| /register | public | P0 | mobile | 79 | 100 | 100 | 91 | 5366 | 102 |

## מתחת ל-100

- **/** (desktop): performance:67, accessibility:97
  - mainthread-work-breakdown: Minimize main-thread work (0)
  - bootup-time: Reduce JavaScript execution time (0)
  - color-contrast: Background and foreground colors do not have a sufficient contrast ratio. (0)
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-css-rules: Reduce unused CSS (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - legacy-javascript-insight: Legacy JavaScript (0)
- **/login** (desktop): performance:75, seo:91
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-css-rules: Reduce unused CSS (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - render-blocking-insight: Render blocking requests (0)
- **/register** (desktop): performance:65, seo:91
  - redirects: Avoid multiple page redirects (0)
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - largest-contentful-paint: Largest Contentful Paint (7)
- **/** (mobile): performance:99, accessibility:97
  - mainthread-work-breakdown: Minimize main-thread work (0)
  - color-contrast: Background and foreground colors do not have a sufficient contrast ratio. (0)
  - unused-css-rules: Reduce unused CSS (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - render-blocking-insight: Render blocking requests (0)
  - unused-javascript: Reduce unused JavaScript (50)
  - legacy-javascript-insight: Legacy JavaScript (50)
  - interactive: Time to Interactive (91)
- **/login** (mobile): performance:97, seo:91
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-css-rules: Reduce unused CSS (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)
  - network-dependency-tree-insight: Network dependency tree (0)
  - render-blocking-insight: Render blocking requests (0)
  - unused-javascript: Reduce unused JavaScript (50)
- **/register** (mobile): performance:79, seo:91
  - redirects: Avoid multiple page redirects (0)
  - mainthread-work-breakdown: Minimize main-thread work (0)
  - bootup-time: Reduce JavaScript execution time (0)
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. (0)
  - unused-javascript: Reduce unused JavaScript (0)
  - meta-description: Document does not have a meta description (0)
  - bf-cache: Page prevented back/forward cache restoration (0)
  - lcp-discovery-insight: LCP request discovery (0)

## הרצה

```bash
npm run lighthouse:matrix:prod -- --tier=public --priority=P0 --strategy=both
npm run lighthouse:auth-setup -- --base=http://127.0.0.1:3000
npm run lighthouse:matrix -- --base=http://127.0.0.1:3000 --tier=auth --priority=P0
npm run lighthouse:report
```
