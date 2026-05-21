import { PRODUCTION_SITE_URL, resolveSiteBaseUrl } from "@/lib/site-url";

export function getWebAuthnOrigin(): string {
  const base = resolveSiteBaseUrl() ?? PRODUCTION_SITE_URL;
  return base.replace(/\/$/, "");
}

/** rpID — סיומת רישומית (ללא www) */
export function getWebAuthnRpId(): string {
  try {
    const host = new URL(getWebAuthnOrigin()).hostname;
    if (host === "localhost") return "localhost";
    if (host.startsWith("www.")) return host.slice(4);
    return host;
  } catch {
    return "bsd-ybm.co.il";
  }
}

export function getWebAuthnRpName(): string {
  return "BSD-YBM OS";
}
