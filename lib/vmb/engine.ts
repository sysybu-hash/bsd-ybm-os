import "server-only";
import { runProject } from "@/lib/projects/pipeline/runProject";
import type { RunInput, RunOutput, RunReport } from "@/lib/vmb/runner";

/**
 * Where the engine plugs into VMB: the one call to runProject (lib/projects/pipeline, M5). Kept apart so the runner's
 * tests never load the engine, and so the cron route is the only function that carries it.
 */
export async function vmbEngine(input: RunInput, report: RunReport): Promise<RunOutput> {
  return runProject(input, report);
}
