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

// Pinned CDN URLs — do not use floating @latest tags.
const REACT_CDN = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_DOM_CDN = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";
const BABEL_CDN = "https://unpkg.com/@babel/standalone@7.26.9/babel.min.js";
const TAILWIND_CDN = "https://cdn.tailwindcss.com/3.4.17";

const IFRAME_CSP = [
  "default-src 'none'",
  "script-src https://unpkg.com https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

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

/** Prevent injected code from breaking out of the Babel script tag. */
export function escapeEmbeddedScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function buildSrcDoc(code: string): string {
  // The user's code is embedded as a Babel <script type="text/babel">.
  // Strip its import lines (React etc. are provided as globals) and rewrite the
  // default export to a known name (__DEFAULT_EXPORT__) so we can mount it.
  let userScript = code
    // drop ESM import lines — React/hooks are available as globals below
    .replace(/^\s*import\s.+?;?\s*$/gm, "");

  // Case A: `export default function Name(...) {...}` — keep the function
  // signature intact, drop only the `export default ` prefix, register by name.
  const namedFn = userScript.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  if (namedFn?.[1]) {
    const name = namedFn[1];
    userScript = userScript.replace(/export\s+default\s+function\s+/, "function ");
    userScript += `\nvar __DEFAULT_EXPORT__ = ${name};`;
  } else {
    // Case B: `export default <expr>` (arrow, identifier, anonymous fn, etc.)
    userScript = userScript.replace(/export\s+default\s+/, "var __DEFAULT_EXPORT__ = ");
  }

  userScript = escapeEmbeddedScript(userScript);

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}" />
    <script src="${TAILWIND_CDN}"></script>
    <script src="${REACT_CDN}" crossorigin></script>
    <script src="${REACT_DOM_CDN}" crossorigin></script>
    <script src="${BABEL_CDN}"></script>
    <style>
      html, body { margin: 0; min-height: 100%; height: auto; }
      #root { min-height: 100%; }
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; overflow: auto; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.addEventListener("error", function (e) {
        parent.postMessage({ __dynRender: true, error: (e.error && e.error.message) || e.message }, "*");
      });
      window.addEventListener("unhandledrejection", function (e) {
        parent.postMessage({ __dynRender: true, error: String(e.reason) }, "*");
      });
    </script>
    <script type="text/babel" data-presets="react,typescript">
      const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, Fragment } = React;
      try {
        ${userScript}

        if (typeof __DEFAULT_EXPORT__ === "undefined") {
          throw new Error(t("workspaceWidgets.appBuilder.noDefaultExport"));
        }
        const root = ReactDOM.createRoot(document.getElementById("root"));
        root.render(React.createElement(__DEFAULT_EXPORT__));
      } catch (err) {
        parent.postMessage({ __dynRender: true, error: (err && err.message) || String(err) }, "*");
      }
    </script>
  </body>
</html>`;
}

export function DynamicSandpackRenderer({ code, className = "" }: DynamicSandpackRendererProps) {
  const { t } = useI18n();

  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const problem = useMemo(() => findCodeProblem(code), [code]);
  const srcDoc = useMemo(() => (problem ? "" : buildSrcDoc(code)), [code, problem]);

  useEffect(() => {
    setRuntimeError(null);
    setIframeReady(false);
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { __dynRender?: boolean; error?: string } | null;
      if (d && typeof d === "object" && d.__dynRender && d.error) {
        setRuntimeError(String(d.error));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [srcDoc]);

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
          srcDoc={srcDoc}
          onLoad={() => setIframeReady(true)}
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
