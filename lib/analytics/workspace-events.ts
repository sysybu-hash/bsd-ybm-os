import type { WidgetType } from "@/hooks/use-window-manager";
import { isHubWidget } from "@/lib/launcher/hub-meta";
import { captureProductEvent } from "@/lib/analytics/posthog-client";

export function trackWidgetOpened(
  type: WidgetType,
  props: { source?: string; mobile?: boolean },
): void {
  captureProductEvent("widget_opened", {
    widget_type: type,
    source: props.source ?? "launcher",
    mobile: props.mobile ? "1" : "0",
  });
  if (isHubWidget(type)) {
    captureProductEvent("hub_opened", {
      hub_type: type,
      source: props.source ?? "launcher",
    });
  }
}

export function trackLauncherWidgetAdded(
  type: WidgetType,
  zone: string,
): void {
  captureProductEvent("launcher_widget_added", {
    widget_type: type,
    zone,
  });
}

export function trackSessionCreateFailed(reason: string): void {
  captureProductEvent("session_create_failed", { reason });
}
