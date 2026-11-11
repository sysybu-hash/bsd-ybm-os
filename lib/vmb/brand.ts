/**
 * VisualModuBuild product identity — the ONLY place the product name lives.
 * Renaming the product later = edit this file (code keeps the neutral id "vmb").
 */
export const VMB_BRAND = {
  /** Full product name, shown in the wordmark and titles. */
  name: "VisualModuBuild",
  /** Segment of the name drawn in the accent colour in the wordmark ("" = none). */
  accentPart: "Modu",
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
