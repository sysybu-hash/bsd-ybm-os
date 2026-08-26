import { test, expect } from "@playwright/test";
import { signInWithRetries, workspaceUrl } from "./helpers";

/**
 * The App Builder's live preview.
 *
 * This had no coverage, which is how it shipped broken. The preview used to be a
 * `srcdoc` iframe, and a `srcdoc` iframe inherits the parent page's CSP — so
 * under CSP_STRICT (what production runs) there was no `'unsafe-eval'`,
 * `@babel/standalone` could not compile a single line, and the preview failed
 * for every user while working perfectly in development.
 *
 * The document is served from its own route now, with its own CSP. These tests
 * guard both halves: that the scoped policy is actually present, and that the
 * compile-and-mount round trip works.
 */
test.describe("app builder preview", () => {
  test("the preview route carries its own scoped CSP", async ({ page, baseURL }) => {
    const signed = await signInWithRetries(page);
    if (!signed) test.skip(true, "E2E credentials not configured");

    const res = await page.request.get(`${baseURL}/api/app-builder/preview`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");

    const csp = res.headers()["content-security-policy"] ?? "";
    // Babel compiles in the browser; without this the preview cannot run at all.
    expect(csp).toContain("'unsafe-eval'");
    // ...and the widened policy must stay scoped rather than leaking site-wide.
    expect(csp).toContain("default-src 'none'");
    // AI-generated code runs in here. It must not be able to call out.
    expect(csp).toContain("connect-src 'none'");
  });

  test("the preview compiles and mounts posted JSX", async ({ page }) => {
    const signed = await signInWithRetries(page);
    if (!signed) test.skip(true, "E2E credentials not configured");

    await page.goto(workspaceUrl({}), { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.src = "/api/app-builder/preview";
      frame.style.cssText = "position:fixed;left:-9999px;width:400px;height:300px";

      const outcome = await new Promise<{ ok?: boolean; error?: string; timeout?: boolean }>(
        (resolve) => {
          const timer = setTimeout(() => resolve({ timeout: true }), 45_000);
          window.addEventListener("message", function onMessage(e) {
            if (e.source !== frame.contentWindow) return;
            const d = e.data as { __dynRender?: boolean; ready?: boolean; error?: string; probe?: string } | null;
            if (!d || !d.__dynRender) return;
            if (d.error) {
              clearTimeout(timer);
              window.removeEventListener("message", onMessage);
              resolve({ error: String(d.error) });
              return;
            }
            if (d.probe === "mounted") {
              clearTimeout(timer);
              window.removeEventListener("message", onMessage);
              resolve({ ok: true });
              return;
            }
            if (d.ready) {
              /**
               * The posted component reports its own mount. Asserting only the
               * absence of an error would pass even if nothing rendered; this
               * needs Babel to have loaded, compiled the JSX, and React to have
               * actually called the component.
               */
              frame.contentWindow?.postMessage(
                {
                  __dynRenderCode:
                    'var __DEFAULT_EXPORT__ = () => { parent.postMessage({ __dynRender: true, probe: "mounted" }, "*"); return <div>ok</div>; };',
                  dir: "rtl",
                  noDefaultExportMessage: "no default export",
                },
                "*",
              );
            }
          });
          document.body.appendChild(frame);
        },
      );

      frame.remove();
      return outcome;
    });

    expect(result.timeout, "preview shell never reported ready").toBeFalsy();
    expect(result.error, "preview reported a compile or runtime error").toBeFalsy();
    expect(result.ok, "component never reported a mount").toBe(true);
  });
});
