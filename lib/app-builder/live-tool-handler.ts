import { isLikelyReactComponent } from "@/lib/app-builder/jsx-preview-utils";
import { APP_BUILDER_LIVE_TOOL_NAMES } from "@/lib/app-builder/live-tools";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

type AppBuilderLiveToolDeps = {
  locale: string;
  getCurrentUiSchema: () => AppBuilderUiSchema | null;
  onCodeApplied?: (code: string) => void;
  onSchemaApplied: (schema: AppBuilderUiSchema) => void;
  onRegeneratePreview?: (schema: AppBuilderUiSchema) => void;
  t: (key: string) => string;
  onBuildReply?: (reply: string) => void;
};

type ChatApiResponse = {
  reply?: string;
  uiSchema?: AppBuilderUiSchema;
  jsxCode?: string;
  schemaError?: string;
  error?: string;
};

function parseDescription(args: Record<string, unknown>): string {
  return typeof args.description === "string" ? args.description.trim() : "";
}

function applyBuildResult(
  data: ChatApiResponse,
  deps: AppBuilderLiveToolDeps,
): boolean {
  const jsxCode = data.jsxCode?.trim();
  if (jsxCode && isLikelyReactComponent(jsxCode)) {
    deps.onCodeApplied?.(jsxCode);
  }
  if (data.uiSchema) {
    deps.onSchemaApplied(data.uiSchema);
    if (!jsxCode && deps.onRegeneratePreview) {
      deps.onRegeneratePreview(data.uiSchema);
    }
    return true;
  }
  return Boolean(jsxCode && isLikelyReactComponent(jsxCode));
}

/** Client handler for App Builder Gemini Live tools — calls chat API and updates preview. */
export async function handleAppBuilderLiveToolCall(
  name: string,
  args: Record<string, unknown>,
  deps: AppBuilderLiveToolDeps,
): Promise<string> {
  if (!APP_BUILDER_LIVE_TOOL_NAMES.has(name)) {
    return deps.t("workspaceWidgets.appBuilder.liveToolUnknown");
  }

  const description = parseDescription(args);
  if (!description) {
    return deps.t("workspaceWidgets.appBuilder.liveToolMissingDescription");
  }

  const currentUiSchema = deps.getCurrentUiSchema();
  if (name === "update_ui" && currentUiSchema == null) {
    return deps.t("workspaceWidgets.appBuilder.liveToolNothingToUpdate");
  }

  const res = await fetch("/api/ai-builder/live-build", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description,
      locale: deps.locale,
      currentUiSchema: name === "build_ui" ? null : currentUiSchema,
      mode: name === "build_ui" ? "build" : "update",
    }),
  });

  const data = (await res.json()) as ChatApiResponse;
  if (!res.ok) {
    return data.error ?? deps.t("workspaceWidgets.appBuilder.liveBuildFailed");
  }

  const applied = applyBuildResult(data, deps);
  if (!applied) {
    return deps.t("workspaceWidgets.appBuilder.liveBuildFailed");
  }

  const reply = data.reply?.trim() || deps.t("workspaceWidgets.appBuilder.liveBuildDone");
  deps.onBuildReply?.(reply);
  return reply;
}
