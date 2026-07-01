"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";
import { captureProductEvent } from "@/lib/analytics/posthog-client";

type Props = Readonly<{
  widgetId: string;
  widgetTitle: string;
  children: React.ReactNode;
}>;

type State = { error: Error | null };

export default class WidgetErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      captureProductEvent("widget_error", {
        widgetId: this.props.widgetId,
        widgetTitle: this.props.widgetTitle,
        message: error.message,
        stack: error.stack ?? "",
        componentStack: info.componentStack ?? "",
      });
    } catch {
      /* swallow telemetry failures */
    }
    try {
      Sentry.captureException(error, {
        tags: { widgetId: this.props.widgetId },
        extra: {
          widgetTitle: this.props.widgetTitle,
          componentStack: info.componentStack ?? "",
        },
      });
    } catch {
      /* Sentry not configured */
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <div className="text-base font-bold text-[color:var(--foreground-main)]">
            הווידג׳ט נתקל בתקלה
          </div>
          <div className="text-xs text-[color:var(--foreground-muted)]">
            {this.props.widgetTitle}
          </div>
          {process.env.NODE_ENV === "development" && (
            <pre className="max-w-full overflow-auto rounded bg-black/30 p-2 text-left text-[10px] text-red-300">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg bg-[color:var(--win-accent,#6366f1)] px-4 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            לנסות שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
