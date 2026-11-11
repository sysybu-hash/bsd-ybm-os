import "server-only";
import type { RunInput, RunOutput, RunReport } from "@/lib/vmb/runner";

/**
 * Where the engine plugs into VMB: `runProject` from `lib/projects/pipeline` (M5) is called here, and nowhere else.
 * Until it exists this throws, which fails the job and gives every credit back. The cron that calls it does nothing at all
 * while `VMB_RUNNER_READY` is off, so no client reaches this line before the engine is in.
 */
export async function vmbEngine(input: RunInput, report: RunReport): Promise<RunOutput> {
  void input;
  void report;
  throw new Error("engine_not_connected");
}
