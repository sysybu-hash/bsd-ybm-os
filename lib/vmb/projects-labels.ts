import "server-only";
import { VMB_PROJECT_KINDS } from "@/lib/validation/schemas/vmb-projects";
import { vmbStudioT } from "@/lib/vmb/studio-context";
import type { BoardLabels } from "@/components/vmb/projects/ProjectsBoard";
import type { ProgressText } from "@/components/vmb/projects/types";
import type { UploadLabels } from "@/components/vmb/upload/UploadZone";
import type { ScanLabels } from "@/components/vmb/scan/ScanFileRow";
import type { QuestionsLabels } from "@/components/vmb/questions/QuestionsForm";
import type { CostLabels } from "@/components/vmb/cost/CostCard";
import { QUESTION_IDS, type Question } from "@/lib/vmb/questions";
import type { StopLabels } from "@/components/vmb/run/StopCard";
import type { BookletLabels } from "@/components/vmb/run/BookletCard";
import type { LiveJobLabels } from "@/components/vmb/projects/LiveJobCard";
import type { CadKind } from "@/lib/projects/building/cad-layers";
import { SUGGEST_VIA } from "@/lib/vmb/rescan";

const p = (k: string) => vmbStudioT(`vmb.projects.${k}`);
const pick = (prefix: string, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, p(`${prefix}_${k}`)]));

export const STAGE_KEYS = ["upload", "scan", "rescan", "read", "build", "render", "paint", "booklet"] as const;
const STATUS_KEYS = ["draft", "identified", "answered", "running", "done", "failed"] as const;

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

/** The questions form's text, for the questions this project asks. */
export function questionsLabels(questions: Question[]): QuestionsLabels {
  const q = (k: string) => vmbStudioT(`vmb.questions.${k}`);
  return {
    title: q("title"),
    subtitle: q("subtitle"),
    fromFiles: q("fromFiles"),
    sources: { header_units: q("src_header_units"), level_marks: q("src_level_marks") },
    change: q("change"),
    isDefault: q("isDefault"),
    save: q("save"),
    skip: q("skip"),
    saved: q("saved"),
    update: q("update"),
    metres: q("metres"),
    failed: q("failed"),
    questions: Object.fromEntries(
      questions.map((x) => [
        x.id,
        {
          title: q(`q_${x.id}_title`),
          hint: q(`q_${x.id}_hint`),
          options: x.type === "number" ? {} : Object.fromEntries(x.options.map((o) => [o, q(`o_${x.id}_${o}`)])),
        },
      ]),
    ),
  };
}

const RUN_BLOCKS = ["questions_pending", "no_files", "no_subscription", "insufficient_credits", "already_running", "runner_not_ready"] as const;

export function costLabels(): CostLabels {
  const c = (k: string) => vmbStudioT(`vmb.cost.${k}`);
  return {
    title: c("title"),
    subtitle: c("subtitle"),
    line: c("line"),
    base: c("base"),
    expected: c("expected"),
    cap: c("cap"),
    balance: c("balance"),
    balanceNow: c("balanceNow"),
    held: c("held"),
    start: c("start"),
    blocks: Object.fromEntries(RUN_BLOCKS.map((b) => [b, c(`block_${b}`)])) as CostLabels["blocks"],
    missing: c("missing"),
    buy: c("buy"),
    queued: c("queued"),
    cancel: c("cancel"),
    failed: c("failed"),
    views: Object.fromEntries(["exterior_day", "exterior_dusk", "aerial", "interior"].map((v) => [v, vmbStudioT(`vmb.questions.o_views_${v}`)])),
  };
}

const r = (k: string) => vmbStudioT(`vmb.run.${k}`);

export function stopLabels(): StopLabels {
  return { title: r("stopTitle"), refunded: r("refunded"), fault: r("fault"), stalled: r("stalled"), pickUnit: r("pickUnit"), unit: r("unit"), failed: r("failed") };
}

export function bookletLabels(): BookletLabels {
  const q = (k: string) => vmbStudioT(`vmb.questions.${k}`);
  return {
    title: r("bookletTitle"),
    ready: r("ready"),
    open: r("open"),
    download: r("download"),
    share: r("share"),
    copied: r("copied"),
    pictures: r("pictures"),
    credits: r("credits"),
    free: r("free"),
    assumptionsTitle: r("assumptionsTitle"),
    assumptionsNone: r("assumptionsNone"),
    unusedTitle: r("unusedTitle"),
    answers: Object.fromEntries(QUESTION_IDS.map((id) => [id, q(`q_${id}_title`)])),
    filesDeleteOn: r("filesDeleteOn"),
    filesDeleted: r("filesDeleted"),
  };
}

export function notifyLabels(): NonNullable<LiveJobLabels["notify"]> {
  return { ask: r("notifyAsk"), on: r("notifyOn"), done: r("notifyDone"), failed: r("notifyFailed") };
}
