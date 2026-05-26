/**
 * צילום של preview הלוגו.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error("Chrome not found");
}

const previewPath = path.join(process.cwd(), "assets", "brand", "preview.html");
const outPath = path.join(process.cwd(), "assets", "brand", "preview.png");

const puppeteer = await import("puppeteer-core");
const browser = await puppeteer.default.launch({
  executablePath: findChrome(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(previewPath).href, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: outPath, fullPage: true, type: "png" });
  console.log("נשמר:", outPath);
} finally {
  await browser.close();
}
