/**
 * VisualModuBuild product identity — the ONLY place the product name lives.
 * Renaming the product later = edit this file (code keeps the neutral id "vmb").
 */
export const VMB_BRAND = {
  /** Full product name, shown in the wordmark and titles. */
  name: "VisualModuBuild",
  /**
   * Logo files, all in public/vmb-brand.
   * The lockup already spells the name, so text is only alt/titles.
   */
  logo: {
    /** Full lockup for dark backgrounds (the default theme). */
    dark: "/vmb-brand/logo-dark.png",
    /** Same lockup with navy lettering, for the light theme. */
    light: "/vmb-brand/logo-light.png",
    /** Pixel size of both lockups. */
    width: 685,
    height: 254,
    /** The cube alone, for tight spaces. */
    mark: "/vmb-brand/mark.png",
    markWidth: 222,
    markHeight: 254,
    /** Tab icon (256 px, transparent) and home-screen icon (180 px, on black). */
    icon: "/vmb-brand/icon.png",
    appleIcon: "/vmb-brand/apple-icon.png",
  },
  /** Install manifest (home screen / installed app), with 192, 512 and maskable cube icons. */
  manifest: "/vmb-brand/manifest.webmanifest",
  /** Short name for tight spaces (tabs, badges). */
  shortName: "VMB",
  /** Parent company line under the wordmark. */
  parent: "BSD-YBM",
  /** Canonical production host. */
  host: "vmb.bsd-ybm.co.il",
  /** Path prefix when served from the main host or a preview URL. */
  pathPrefix: "/vmb",
} as const;

export const VMB_ORIGIN = `https://${VMB_BRAND.host}`;

/** True when a hostname is the product's own subdomain (prod `vmb.*`, dev `vmb.localhost`). */
export function isVmbHost(hostname: string | null | undefined): boolean {
  const h = (hostname ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
  return h.startsWith("vmb.");
}

/** Hosts a browser may reach the product on: production, the main host's /vmb, previews, and local dev. */
const PUBLIC_HOSTS = new Set([VMB_BRAND.host, "bsd-ybm.co.il", "www.bsd-ybm.co.il", "localhost:3000", "vmb.localhost:3000", "127.0.0.1:3000"]);

/**
 * The origin the browser used, for links that leave the site and come back (OAuth redirect_uri).
 * Not `req.nextUrl.origin`: in dev that is the server's bind address (http://0.0.0.0:3000), which Google rejects.
 * Taken from the Host header only when it is a known host; anything else falls back to `fallback`.
 */
export function publicOrigin(headers: Headers, fallback: string): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!host || !(PUBLIC_HOSTS.has(host) || /^[a-z0-9-]+\.vercel\.app$/.test(host))) return fallback;
  const local = /^(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}
