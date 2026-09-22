import { readFile } from "fs/promises";
import path from "path";

import type { Browser, HTTPRequest, Page } from "puppeteer-core";

/**
 * A page that can run three.js, served to Chromium off disk.
 *
 * The modules cannot be loaded from a CDN — the site's CSP forbids it and a
 * network fetch would make a render depend on the weather — and they cannot be
 * loaded over file://, because Chrome gives a file document a null origin and
 * refuses its module imports. So the page is served from an origin that only
 * exists inside this browser: every request to it is answered from
 * node_modules. three.module.js imports ./three.core.js relatively, and that
 * resolves against the same origin, which is the whole reason for the origin.
 */

const ORIGIN = "https://render3d.local";

/** three's split build: the entry and the core it imports beside itself. */
const THREE_FILES = ["three.module.js", "three.core.js"] as const;

const threeCache = new Map<string, string>();

async function threeSource(file: string): Promise<string> {
  const cached = threeCache.get(file);
  if (cached) return cached;
  const full = path.join(process.cwd(), "node_modules", "three", "build", file);
  const text = await readFile(full, "utf8");
  threeCache.set(file, text);
  return text;
}

/** Opens a page whose only server is this function. */
export async function openScenePage(browser: Browser, html: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (req: HTTPRequest) => {
    const url = req.url();
    if (!url.startsWith(ORIGIN)) {
      // Nothing else may be fetched: a render reads from disk or not at all.
      void req.abort();
      return;
    }
    const name = url.slice(ORIGIN.length + 1) || "index.html";
    if (name === "index.html") {
      void req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      return;
    }
    if ((THREE_FILES as readonly string[]).includes(name)) {
      void threeSource(name).then(
        (body) => req.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body }),
        () => req.abort(),
      );
      return;
    }
    void req.respond({ status: 404, contentType: "text/plain", body: "not here" });
  });
  await page.goto(`${ORIGIN}/index.html`, { waitUntil: "load" });
  return page;
}

export const SCENE_PAGE_ORIGIN = ORIGIN;
export const THREE_MODULE_URL = `${ORIGIN}/three.module.js`;
