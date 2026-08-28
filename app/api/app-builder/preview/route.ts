import { NextResponse } from "next/server";

/**
 * The App Builder's preview document.
 *
 * This exists because a `srcdoc` iframe **inherits the parent page's CSP**. With
 * `CSP_STRICT` on — which production runs — the site policy has no
 * `'unsafe-eval'` and does not allow `cdn.tailwindcss.com`, so the preview's own
 * `<meta>` CSP could not widen it: `@babel/standalone` could not compile a
 * single line, and Tailwind never loaded. The preview worked in development,
 * where the policy is relaxed, and was broken in production.
 *
 * Verified on the live site before this change: inside a `srcdoc` iframe whose
 * own CSP explicitly granted `'unsafe-eval'`, `new Function('return 1+1')` still
 * threw `EvalError: ... violates the following Content Security Policy`.
 *
 * A document fetched by `src` gets the CSP from *its own* response headers
 * instead, so the widened policy stays scoped to this one route and the rest of
 * the site keeps the strict one.
 *
 * The shell is static and carries no user code: the parent posts the source in
 * after `ready`. That keeps this response cacheable and keeps generated code out
 * of URLs and server logs.
 */

const REACT_CDN = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_SRI = "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z";
const REACT_DOM_CDN = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";
const REACT_DOM_SRI = "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1";
const BABEL_CDN = "https://unpkg.com/@babel/standalone@7.26.9/babel.min.js";
const BABEL_SRI = "sha384-pKNXKj7jF9BNMkQyGWg5YLfoPyqBa/gf7wjTSoTGQlwxbZB+sabJuKyOHR6JQvTd";
const TAILWIND_CDN = "https://cdn.tailwindcss.com/3.4.17";

/**
 * Scoped to this route only. `connect-src 'none'` matters: the preview runs
 * AI-generated code, and this is what stops that code calling home.
 */
const PREVIEW_CSP = [
  "default-src 'none'",
  `script-src ${new URL(REACT_CDN).origin} ${new URL(TAILWIND_CDN).origin} 'unsafe-inline' 'unsafe-eval'`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const SHELL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="${TAILWIND_CDN}"></script>
    <script src="${REACT_CDN}" integrity="${REACT_SRI}" crossorigin="anonymous"></script>
    <script src="${REACT_DOM_CDN}" integrity="${REACT_DOM_SRI}" crossorigin="anonymous"></script>
    <script src="${BABEL_CDN}" integrity="${BABEL_SRI}" crossorigin="anonymous"></script>
    <style>
      html, body { margin: 0; min-height: 100%; height: auto; }
      #root { min-height: 100%; }
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; overflow: auto; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      (function () {
        function report(error) {
          parent.postMessage({ __dynRender: true, error: String(error) }, "*");
        }
        window.addEventListener("error", function (e) {
          report((e.error && e.error.message) || e.message);
        });
        window.addEventListener("unhandledrejection", function (e) {
          report(e.reason);
        });

        function mount(source, dir, noDefaultExportMessage) {
          document.documentElement.setAttribute("dir", dir === "rtl" ? "rtl" : "ltr");
          try {
            if (!window.Babel) throw new Error("Babel failed to load");
            var wrapped =
              'const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, Fragment } = React;\\n' +
              source +
              '\\nif (typeof __DEFAULT_EXPORT__ === "undefined") { throw new Error(' +
              JSON.stringify(noDefaultExportMessage) +
              '); }\\n' +
              'ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(__DEFAULT_EXPORT__));';
            var out = window.Babel.transform(wrapped, { presets: ["react", "typescript"], filename: "preview.tsx" }).code;
            // Evaluating the generated component is the entire purpose of this
            // document. It runs inside a srcdoc iframe whose own CSP allows no
            // connect-src and no nested frames, and the code arrives by
            // postMessage rather than through HTML parsing, so there is no
            // </script> breakout to worry about either.
            // eslint-disable-next-line no-new-func
            new Function(out)();
          } catch (err) {
            report((err && err.message) || err);
          }
        }

        window.addEventListener("message", function (e) {
          // Only the embedding page may drive this document.
          if (e.source !== window.parent) return;
          var d = e.data;
          if (!d || d.__dynRenderCode == null) return;
          document.getElementById("root").innerHTML = "";
          mount(String(d.__dynRenderCode), d.dir, d.noDefaultExportMessage || "No default export");
        });

        parent.postMessage({ __dynRender: true, ready: true }, "*");
      })();
    </script>
  </body>
</html>`;

export function GET() {
  return new NextResponse(SHELL, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PREVIEW_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // Static shell, no user data — safe to cache, and it keeps the 3MB of
      // Babel out of the critical path on repeat previews.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
