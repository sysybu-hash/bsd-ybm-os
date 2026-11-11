import "server-only";
import type { WorkbenchLabels } from "@/components/vmb/studio3d/StudioWorkbench";
import { vmbStudioT } from "@/lib/vmb/studio-context";

const m = (k: string) => vmbStudioT(`vmb.m3.${k}`);

/** Every word the studio (plan M3) shows, from messages/vmb.*.json. */
export function workbenchLabels(): WorkbenchLabels {
  return {
    tab3d: m("tab3d"),
    tabSheet: m("tabSheet"),
    loading: m("loading"),
    failed: m("failed"),
    camerasTitle: m("camerasTitle"),
    locator: m("locator"),
    add: m("add"),
    newName: m("newName"),
    remove: m("remove"),
    pending: m("pending"),
    yours: m("yours"),
    max: m("max"),
    saveFailed: m("saveFailed"),
    nextRun: m("nextRun"),
    noSheet: m("noSheet"),
    viewer: { walls: m("walls"), furniture: m("furniture"), cut: m("cut"), hint: m("hint"), unavailable: m("unavailable") },
    overlay: { sheet: m("sheet"), overlay: m("overlay"), far: m("far"), close: m("close"), near: m("near"), away: m("away"), summary: m("summary"), none: m("overlayNone") },
  };
}

export const studioWord = m;
