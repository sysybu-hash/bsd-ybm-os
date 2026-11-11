import "server-only";
import { VMB_PROJECT_KINDS } from "@/lib/validation/schemas/vmb-projects";
import { vmbStudioT } from "@/lib/vmb/studio-context";
import type { BoardLabels } from "@/components/vmb/projects/ProjectsBoard";
import type { ProgressText } from "@/components/vmb/projects/types";
import type { UploadLabels } from "@/components/vmb/upload/UploadZone";
import type { ScanLabels } from "@/components/vmb/scan/ScanFileRow";
import type { CadKind } from "@/lib/projects/building/cad-layers";
import { SUGGEST_VIA } from "@/lib/vmb/rescan";

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

const ERROR_CODES = ["generic", "storage_off", "too_many_files", "project_too_large", "file_too_large", "bad_kind", "bad_path", "not_found", "refused"] as const;

export function uploadLabels(): UploadLabels {
  const u = (k: string) => vmbStudioT(`vmb.upload.${k}`);
  return {
    dropTitle: u("dropTitle"),
    dropBody: u("dropBody"),
    dropActive: u("dropActive"),
    pickFolder: u("pickFolder"),
    pickFiles: u("pickFiles"),
    summary: u("summary"),
    skipped: u("skipped"),
    queued: u("queued"),
    uploading: u("uploading"),
    saving: u("saving"),
    done: u("done"),
    retry: u("retry"),
    remove: u("remove"),
    errors: Object.fromEntries(ERROR_CODES.map((c) => [c, u(`err_${c}`)])),
  };
}

const CAD_KIND_KEYS = ["wall-ext", "wall-int", "door", "window", "parking", "lawn", "planting", "tree", "paving", "fence", "railing", "stairs", "plot", "gate", "bins", "sanitary", "furniture", "overhead", "text", "dimension", "group", "ignore"] as const satisfies readonly CadKind[];

const SCAN_ERRORS = ["generic", "not_found", "kind_not_scanned", "fetch_failed", "unreadable"] as const;
const UNREAD_REASON_KEYS = ["no_reader", "off_layer", "frozen_layer", "unsupported", "invisible", "too_dense", "other"] as const;

export function scanLabels(): ScanLabels {
  const s = (k: string) => vmbStudioT(`vmb.scan.${k}`);
  const by = <K extends string>(prefix: string, keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, s(`${prefix}_${k}`)])) as Record<K, string>;
  return {
    title: s("title"),
    subtitle: s("subtitle"),
    read: s("read"),
    kinds: by("kind", ["layers", "blocks", "entities", "hatches"] as const),
    unreadTitle: s("unreadTitle"),
    allRead: s("allRead"),
    reasons: by("reason", UNREAD_REASON_KEYS),
    holds: by("holds", ["lines", "hatches", "texts", "arcs", "blocks"] as const),
    scanning: s("scanning"),
    waiting: s("waiting"),
    rescan: s("rescan"),
    showMore: s("showMore"),
    showLess: s("showLess"),
    notScannedYet: s("notScannedYet"),
    empty: s("empty"),
    errors: by("err", SCAN_ERRORS),
    rescanMore: s("rescanMore"),
    round: s("round"),
    rescanBox: {
      loading: s("rb_loading"),
      found: s("rb_found"),
      deeper: s("rb_deeper"),
      nothing: s("rb_nothing"),
      approve: s("rb_approve"),
      cancel: s("rb_cancel"),
      readsAs: s("rb_readsAs"),
      failed: s("rb_failed"),
      kinds: by("cadkind", CAD_KIND_KEYS),
      via: by("via", SUGGEST_VIA),
    },
  };
}
