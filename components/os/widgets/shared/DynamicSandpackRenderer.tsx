"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { Loader2 } from "lucide-react";

interface DynamicSandpackRendererProps {
  /** Raw React component source (JSX/TSX). Must default-export a component. */
  code: string;
  className?: string;
}

/**
 * Self-contained live renderer for AI-generated React components.
 *
 * Transpiles in-browser with @babel/standalone inside a sandboxed <iframe>,
 * loading pinned React + Babel + Tailwind from CDN. Runtime/compile errors
 * are posted back via postMessage (source-checked) and shown as a clean card.
 */

/**
 * The preview runs in /api/app-builder/preview, not in a `srcdoc`.
 *
 * A `srcdoc` iframe inherits the parent page's CSP, and production runs with
 * CSP_STRICT — no `'unsafe-eval'`, no cdn.tailwindcss.com. The preview's own
 * `<meta>` CSP cannot widen that, so Babel could not compile and the live
 * preview was broken in production while working in development. Verified on
 * the live site: `new Function('return 1+1')` inside a `srcdoc` iframe threw
 * EvalError even when that iframe's CSP granted `'unsafe-eval'`.
 *
 * A document loaded via `src` gets the CSP from its own response headers, so
 * the widened policy stays scoped to that one route. The runtime URLs and their
 * SRI hashes live there too.
 */
const PREVIEW_URL = "/api/app-builder/preview";

/**
 * Minimal pre-check: only reject empty input. Real syntax/parse errors are
 * caught reliably by Babel inside the iframe and surfaced via postMessage —
 * a hand-rolled balance/quote scanner produces false positives on valid JSX
 * (apostrophes in text, template literals, JSX expressions, division), so we
 * deliberately do NOT attempt structural validation here.
 */
function findCodeProblem(code: string): string | null {
  return code.trim() ? null : "empty";
}


/**
 * Normalise AI-generated source so the preview shell can mount it.
 *
 * Strips ESM imports (React and its hooks are provided as globals) and rewrites
 * the default export to a known name. Unchanged from the previous version — only
 * the HTML wrapper around it moved to the preview route.
 */
function prepareUserSource(code: string): string {
  let userScript = code.replace(/^\s*import\s.+?;?\s*$/gm, "");

  // Case A: `export default function Name(...) {...}` — keep the signature,
  // drop only the `export default ` prefix, register by name.
  const namedFn = userScript.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  if (namedFn?.[1]) {
    const name = namedFn[1];
    userScript = userScript.replace(/export\s+default\s+function\s+/, "function ");
    userScript += `\nvar __DEFAULT_EXPORT__ = ${name};`;
  } else {
    // Case B: `export default <expr>` (arrow, identifier, anonymous fn, ...)
    userScript = userScript.replace(/export\s+default\s+/, "var __DEFAULT_EXPORT__ = ");
  }

  return userScript;
}

export function DynamicSandpackRenderer({ code, className = "" }: DynamicSandpackRendererProps) {
  const { t, dir } = useI18n();

  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const problem = useMemo(() => findCodeProblem(code), [code]);
  const source = useMemo(() => (problem ? "" : prepareUserSource(code)), [code, problem]);

  // New source invalidates the previous run's error. Cleared during render so a
  // stale error never paints over the new preview.
  const [lastSource, setLastSource] = useState(source);
  if (source !== lastSource) {
    setLastSource(source);
    setRuntimeError(null);
  }

  const noDefaultExport = t("workspaceWidgets.appBuilder.noDefaultExport");

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { __dynRender?: boolean; error?: string; ready?: boolean } | null;
      if (!d || typeof d !== "object" || !d.__dynRender) return;
      if (d.error) {
        setRuntimeError(String(d.error));
        return;
      }
      if (d.ready) setIframeReady(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /**
   * Hand the source to the shell once it reports ready, and again whenever the
   * source changes. The iframe is never reloaded for a new version — the 3MB of
   * Babel is downloaded once per session rather than once per regeneration.
   */
  useEffect(() => {
    if (!iframeReady || !source) return;
    iframeRef.current?.contentWindow?.postMessage(
      { __dynRenderCode: source, dir, noDefaultExportMessage: noDefaultExport },
      "*",
    );
  }, [iframeReady, source, dir, noDefaultExport]);

  const showError = problem != null || runtimeError != null;

  return (
    <div
      className={`relative flex min-h-[240px] w-full flex-1 flex-col overflow-hidden rounded-lg border border-border-main bg-white ${className}`}
    >
      {!problem && (
        <iframe
          ref={iframeRef}
          title="Dynamic Preview"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={PREVIEW_URL}
          className={`w-full h-full border-0 bg-white transition-opacity duration-200 ${iframeReady ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {!problem && !iframeReady && !showError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      )}
      {showError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center">
          <div className="text-4xl">⚠️</div>
          <div className="text-base font-semibold text-gray-800">
            {t("workspaceWidgets.sharedUi.invalidCode")}
          </div>
          <div className="text-sm text-gray-500 max-w-md break-words" dir="ltr">
            {runtimeError ?? t("workspaceWidgets.sharedUi.invalidCodeHint")}
          </div>
        </div>
      )}
    </div>
  );
}
