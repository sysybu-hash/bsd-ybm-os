/**
 * יוצר PDF דף מוצר לשיווק בעברית.
 * הרצה: npx tsx scripts/generate-product-brochure-pdf.ts
 */
import fs from "node:fs";
import path from "node:path";
import { listMissingProductScreenshots } from "../lib/pdf/product-brochure-screenshots";
import { renderProductBrochurePdf } from "../lib/pdf/product-brochure";

const outDir = path.join(process.cwd(), "docs");
const outFile = path.join(outDir, "BSD-YBM-OS-דף-מוצר.pdf");

async function main() {
  const missing = listMissingProductScreenshots();
  if (missing.length > 0) {
    console.warn(
      `חסרות ${missing.length} תמונות מסך — הריצו: npm run product-brochure:capture\n  ${missing.join(", ")}`,
    );
  }

  const { bytes, engine } = await renderProductBrochurePdf();
  fs.mkdirSync(outDir, { recursive: true });
  const tmpFile = `${outFile}.tmp`;
  const altFile = path.join(outDir, "BSD-YBM-OS-דף-מוצר-מעודכן.pdf");
  fs.writeFileSync(tmpFile, bytes);

  let written = outFile;
  try {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.renameSync(tmpFile, outFile);
  } catch {
    fs.copyFileSync(tmpFile, altFile);
    written = altFile;
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    console.warn(
      `הקובץ ${outFile} פתוח ב-Viewer — נשמר עותק: ${altFile}. סגרו את ה-PDF הישן והריצו שוב.`,
    );
  }

  console.log(
    `נוצר: ${written} (${bytes.byteLength.toLocaleString("he-IL")} bytes, מנוע: ${engine})`,
  );
  if (engine === "pdfmake") {
    console.warn(
      "אזהרה: Chrome לא זמין — ה-PDF נוצר ב-pdfmake (עברית/RTL פחות מדויקים). התקינו Chrome להדפסה איכותית.",
    );
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("יצירת PDF נכשלה:", msg);
  process.exitCode = 1;
});
