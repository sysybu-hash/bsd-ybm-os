import { createHash } from "node:crypto";

import { PRODUCTION_SITE_URL } from "@/lib/core/site-url";

/** Chrome WebAPK package prefix — see chromium WebApkConstants. */
const WEBAPK_PACKAGE_PREFIX = "org.chromium.webapk.";

/**
 * Derives the WebAPK package name Chrome assigns for a given origin.
 * @see https://web.dev/articles/webapks
 */
export function webApkPackageNameForOrigin(origin: string): string {
  const normalized = origin.trim().replace(/\/$/, "");
  const digest = createHash("sha256").update(normalized).digest();
  const encoded = digest.toString("base64url").slice(0, 32).toLowerCase();
  return `${WEBAPK_PACKAGE_PREFIX}${encoded}`;
}

/** Origins that may mint a WebAPK for this site (www is canonical; apex redirects). */
export function webApkOriginsForSite(): string[] {
  const canonical = PRODUCTION_SITE_URL.replace(/\/$/, "");
  try {
    const url = new URL(canonical);
    const apex = `${url.protocol}//${url.hostname.replace(/^www\./, "")}`;
    const origins = new Set([canonical, apex]);
    return [...origins];
  } catch {
    return [canonical];
  }
}

export function webApkPackageNamesForSite(): string[] {
  return webApkOriginsForSite().map(webApkPackageNameForOrigin);
}
