/**
 * Warm up Next.js before Lighthouse audits (avoids cold-start outlier on CI).
 * @param {import('puppeteer').Browser} browser
 */
module.exports = async (browser) => {
  const page = await browser.newPage();
  try {
    await page.goto("http://localhost:3000/", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
  } finally {
    await page.close();
  }
};
