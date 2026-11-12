import "server-only";
import { withBookletBrand } from "@/lib/projects/building/booklet-brand";
import { runProject } from "@/lib/projects/pipeline/runProject";
import { VMB_BRAND, VMB_ORIGIN } from "@/lib/vmb/brand";
import { VMB_LOGO_DARK_PNG_BASE64 } from "@/lib/vmb/brand-logo.generated";
import type { RunInput, RunOutput, RunReport } from "@/lib/vmb/runner";

/**
 * Where the engine plugs into VMB: the one call to runProject (lib/projects/pipeline, M5). Kept apart so the runner's
 * tests never load the engine, and so the cron route is the only function that carries it.
 */
export async function vmbEngine(input: RunInput, report: RunReport): Promise<RunOutput> {
  // The booklet carries VMB's name, site and logo, not BSD-YBM's.
  return withBookletBrand({ name: VMB_BRAND.name, site: VMB_ORIGIN, logoPngBase64: VMB_LOGO_DARK_PNG_BASE64 }, () => runProject(input, report));
}
