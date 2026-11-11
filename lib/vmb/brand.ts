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
