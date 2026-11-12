import { AsyncLocalStorage } from "node:async_hooks";
import { BSD_YBM_LOGO_PNG_BASE64 } from "@/lib/pdf/font-data.generated";

/**
 * Whose booklet it is: the name, site and logo on every page. BSD-YBM's own booklets keep the default; VisualModuBuild
 * runs the engine inside withBookletBrand (lib/vmb/engine.ts), so the same pages carry its name without the pipelines
 * passing it down through every step.
 */
export type BookletBrand = { name: string; site: string; logoPngBase64: string | null };

export const BSD_YBM_BOOKLET_BRAND: BookletBrand = { name: "BSD-YBM", site: "https://www.bsd-ybm.co.il", logoPngBase64: BSD_YBM_LOGO_PNG_BASE64 || null };

const current = new AsyncLocalStorage<BookletBrand>();

export function bookletBrand(): BookletBrand {
  return current.getStore() ?? BSD_YBM_BOOKLET_BRAND;
}

export function withBookletBrand<T>(brand: BookletBrand, fn: () => T): T {
  return current.run(brand, fn);
}
