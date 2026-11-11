import "server-only";
import { VMB_PROJECT_KINDS } from "@/lib/validation/schemas/vmb-projects";
import { vmbStudioT } from "@/lib/vmb/studio-context";
import type { BoardLabels } from "@/components/vmb/projects/ProjectsBoard";
import type { ProgressText } from "@/components/vmb/projects/types";

const p = (k: string) => vmbStudioT(`vmb.projects.${k}`);
const pick = (prefix: string, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, p(`${prefix}_${k}`)]));

export const STAGE_KEYS = ["upload", "scan", "rescan", "read", "build", "render", "paint", "booklet"] as const;
const STATUS_KEYS = ["draft", "identified", "running", "done", "failed"] as const;

export function kindLabels(): Record<string, string> {
  return pick("kind", VMB_PROJECT_KINDS);
}

export function progressText(): ProgressText {
  return {
    etaMinutes: p("etaMinutes"),
    etaSoon: p("etaSoon"),
    etaUnknown: p("etaUnknown"),
    stages: pick("stage", STAGE_KEYS),
    stageWorking: p("stageWorking"),
    queued: p("queued"),
  };
}

export function boardLabels(): BoardLabels {
  const kinds = kindLabels();
  return {
    title: p("title"),
    subtitle: p("subtitle"),
    newProject: p("new"),
    emptyTitle: p("emptyTitle"),
    emptyBody: p("emptyBody"),
    card: {
      kinds,
      statuses: pick("status", STATUS_KEYS),
      updated: p("updated"),
      open: p("open"),
      failed: p("status_failed"),
      progress: progressText(),
    },
    dialog: {
      title: p("newTitle"),
      name: p("name"),
      namePlaceholder: p("namePlaceholder"),
      kind: p("kind"),
      kinds,
      create: p("create"),
      cancel: p("cancel"),
      fail: p("createFail"),
    },
  };
}
