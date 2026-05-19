# ESLint — מעקב תיקונים

יעד: `npm run lint -- --max-warnings 0`

## בוצע

- `eslint.config.js` — התעלמות מ-`.claude/**` (מניעת OOM)
- `GoogleDriveWidget.tsx` — `driveError` ב-deps של `useCallback`
- `MeckanoReportsWidget.tsx` — `t` ב-`useEffect`
- `NotebookLMWidget.tsx` — `t` ב-`refreshSavedList` ו-`useEffect(liveData)`
- `DocumentClientPicker.tsx` — `aria-selected` על `role="option"`
- `ScanFilePreview.tsx` — `next/image` במקום `<img>`
- `useGeminiLiveAudio.ts` — `useMemo` ל-`statusLabels`
- `ErpFileArchiveWidget.tsx` — הסרת `eslint-disable` מיותר

## אימות

```bash
npm run lint -- --max-warnings 0
```
