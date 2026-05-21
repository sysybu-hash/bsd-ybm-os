import { getLauncherNavMeta } from "@/lib/launcher/launcher-icons";
import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";

describe("launcher-icons", () => {
  it("returns an icon for every picker catalog widget", () => {
    for (const w of OS_ASSISTANT_WIDGETS) {
      const meta = getLauncherNavMeta(w.id);
      expect(meta.icon).toBeTruthy();
    }
  });

  it("covers legacy widgets missing from older launcher meta", () => {
    for (const id of ["project", "cashflow", "erp"] as const) {
      expect(getLauncherNavMeta(id).icon).toBeDefined();
    }
  });
});
