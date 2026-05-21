# פריסת חלונות, PWA ו-Gemini Live

## חלונות (מובייל ודסקטופ)

- מדיניות: `lib/workspace/window-layout-policy.ts`
- שמירת layout: `bsd_ybm_layout_quiet_v4` (מיגרציה אוטומטית מ-v3)
- במובייל: חלון יחיד במסך מלא (`isMaximized`), ללא גרירה/שינוי גודל
- `AdaptiveWidgetShell`: מחלקה `workspace-window--mobile` + inset מ-`--workspace-inset-top/bottom`

## PWA

- `public/manifest.json` — shortcuts ל-`?w=...`
- `public/sw.js` — cache v5 + offline.html
- `components/os/system/PwaInstallBanner.tsx` — התקנה (Android/iOS)

## Gemini Live

- יחיד: `lib/gemini-live/session-coordinator.ts`
- Omnibar: `owner: "omnibar"` — Live רק אחרי לחיצה על מיקרופון
- צ'אט: `owner: "aiChatFull"` — Live רק אחרי «הפעל» בטאב Live (או `startLive` מ-Omnibar)
- ברכה: `lib/gemini-live/welcome-script.ts` — משפט קצר ניטרלי
