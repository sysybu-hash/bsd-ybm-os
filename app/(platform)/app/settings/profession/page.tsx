import { redirect } from "next/navigation";
import { buildWorkspaceSearchParams, workspaceUrlFromParams } from "@/lib/workspace-url";

/** פותח את וידג'ט ההגדרות במרחב העבודה — פאנל תחום העסק בראש המסך */
export default function SettingsProfessionPage() {
  const sp = buildWorkspaceSearchParams({
    widgetType: "settings",
    viewState: { segment: "profession" },
  });
  redirect(workspaceUrlFromParams(sp));
}
