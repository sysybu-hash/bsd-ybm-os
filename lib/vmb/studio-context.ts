import "server-only";
import { redirect } from "next/navigation";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";
import { creditBalance } from "@/lib/vmb/credits";
import { vmbT } from "@/lib/vmb/i18n";
import { ensureWorkspace } from "@/lib/vmb/workspace";
import type { FrameLabels } from "@/components/vmb/studio/StudioFrame";

export const vmbStudioT = vmbT("he");

/** Every studio page starts here: the signed-in user (or the login page), their office and its balance. */
export async function getStudioContext() {
  const user = await getVmbPageUser();
  if (!user) redirect(await vmbServerPath("/login"));
  const ws = await ensureWorkspace(user);
  const credits = await creditBalance(ws.id);
  return { user, ws, credits };
}

export function frameLabels(): FrameLabels {
  const s = (k: string) => vmbStudioT(`vmb.studio.${k}`);
  return { projects: s("projects"), account: s("account"), credits: s("credits"), themeLight: s("themeLight"), themeDark: s("themeDark") };
}

/** The seven step names, in rail order. */
export function stepLabels(): string[] {
  return ["stepUpload", "stepScan", "stepQuestions", "stepCost", "stepRun", "stepStudio", "stepBooklet"].map((k) => vmbStudioT(`vmb.studio.${k}`));
}

/** Where a project stands on the rail, from its status. */
export function railStep(status: string): number {
  switch (status) {
    case "identified":
      return 2;
    case "running":
    case "failed":
      return 4;
    case "done":
      return 6;
    default:
      return 0;
  }
}
