"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";
import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { useI18n } from "@/components/os/system/I18nProvider";

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
        <WidgetErrorFallback
          widgetTitle={this.props.widgetTitle}
          error={this.state.error}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * The visible half, split out as a function component so it can call useI18n —
 * an error boundary has to be a class, and hooks are not available there.
 *
 * useI18n degrades to returning the key when no provider is above it, which is
 * possible if a widget throws early in the boot sequence. Hence the explicit
 * fallbacks: a user seeing a crash should not also see a raw message key.
 */
function WidgetErrorFallback({
  widgetTitle,
  error,
  onRetry,
}: Readonly<{ widgetTitle: string; error: Error; onRetry: () => void }>) {
  const { t } = useI18n();
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  return (
    <div
      role="alert"
      className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <div className="text-base font-bold text-[color:var(--foreground-main)]">
        {tr("workspaceWidgets.errorBoundary.title", "הווידג׳ט נתקל בתקלה")}
      </div>
      <div className="text-xs text-[color:var(--foreground-muted)]">{widgetTitle}</div>
      {/* Client component: NODE_ENV is inlined by the bundler here, so this
          stays process.env rather than the server-only env proxy. */}
      {process.env.NODE_ENV === "development" && (
        <pre className="max-w-full overflow-auto rounded bg-black/30 p-2 text-left text-[10px] text-red-300">
          {error.message}
        </pre>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-[color:var(--win-accent,#6366f1)] px-4 py-2 text-xs font-bold text-white hover:opacity-90"
      >
        {tr("workspaceWidgets.retry", "נסה שוב")}
      </button>
    </div>
  );
}
