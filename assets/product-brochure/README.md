# צילומי מסך לדף מוצר (PDF)

תמונות אלה נלכדות אוטומטית מהמערכת ומשולבות ב-`docs/BSD-YBM-OS-דף-מוצר.pdf`.

## עדכון

```bash
# שרת פיתוח חייב לרוץ + משתמש דמו
PAYPAL_ENV=sandbox npm run dev
node scripts/seed-test-data.mjs
npm run product-brochure:build
```

או בנפרד: `product-brochure:capture` ואז `product-brochure:pdf`.
