# התקנת PWA באנדרoid — Play Protect

## סימптום

הודעה בעברית: **«אפליקציה לא בטוחה נחסמה»** / **«נבנתה לגרסת Android ישנה»** בעת «התקן אפליקציה» או «הוסף למסך הבית».

## שורש הבעיה (בפרויקט זה)

1. **אין APK / TWA ב-repo** — ההתקנה היא WebAPK ש-Chrome (או דפדפן אחר) מייצר אוטומטית.
2. **`/.well-known/assetlinks.json` חסר** — Chrome לא יכול לאמת Digital Asset Links; זה מחמיר אזהרות Play Protect.
3. **דפדפן / שרת minting ישן** — Android 14+ חוסם WebAPK עם `targetSdkVersion` < 34. Chrome המעודכן מ minting server עדכני; Samsung Internet ודפדפנים אחרים עלולים לא.
4. **התקנה מ-apex** — `bsd-ybm.co.il` מפנה ל-`www.bsd-ybm.co.il`; WebAPK נוצר לפי origin — יש להתקין רק מ-www.

## מה תוקן בקוד

| קובץ | שינוי |
|------|--------|
| `app/.well-known/assetlinks.json/route.ts` | מגיש Digital Asset Links ל-Chrome WebAPK |
| `lib/pwa/assetlinks.ts` | טביעות SHA-256 של Chrome + package names |
| `lib/pwa/webapk-package.ts` | חישוב `org.chromium.webapk.*` ל-www ול-apex |
| `public/manifest.json` | `id` מלא, `launch_handler`, `start_url` עם `source=pwa` |
| `lib/site-metadata.ts` | `mobile-web-app-capable` |
| `components/os/system/PwaInstallBanner.tsx` | הנחיות Play Protect / Chrome |

## הנחיות למשתמש (workaround)

1. **עדכנו Chrome** מה-Play Store (גרסה עדכנית).
2. **פתחו** `https://www.bsd-ybm.co.il` (עם www).
3. **התקינו** דרך Chrome: תפריט (⋮) → «התקן אפליקציה» / «Install app».
4. אם Play Protect עדיין חוסם: **«התקן בכל זאת»** / **Install anyway** (אפליקציה רשמית מהאתר, לא APK חיצוני).
5. **אל תשתמשו** ב-Samsung Internet / Firefox להתקנה אם מופיעה אזהרה — עברו ל-Chrome.
6. **אל ת sideload** קובץ APK ישן — אין הפצת APK רשמית מחוץ ל-Chrome WebAPK.

## אימות אחרי deploy

```text
https://www.bsd-ybm.co.il/.well-known/assetlinks.json  → 200, Content-Type: application/json
https://www.bsd-ybm.co.il/manifest.json               → id: https://www.bsd-ybm.co.il/
```

אחרי deploy: הסירו התקנה קודמת, נקו cache לדומיין ב-Chrome, והתקינו מחדש.

## Play Store / TWA (עתידי)

להפצה ב-Play Store: Bubblewrap עם `targetSdkVersion` ≥ 34, `compileSdkVersion` ≥ 34, ו-`assetlinks.json` עם טביעת מפתח החתימה של ה-AAB — בנוסף ל-WebAPK entries.
