import { redirect } from "next/navigation";
import { buildWorkspaceSearchParams, workspaceUrlFromParams } from "@/lib/workspace-url";

/** פותח את וידג'ט מחולל האפליקציות במרחב העבודה */
export default function AppBuilderPage() {
  const sp = buildWorkspaceSearchParams({ widgetType: "appBuilder" });
  redirect(workspaceUrlFromParams(sp));
}
