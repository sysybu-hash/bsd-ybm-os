import { chromium } from "@playwright/test";
const BASE = "https://www.bsd-ybm.co.il";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: "reports/.lighthouse-auth-state.json" });

const res = await ctx.request.get(`${BASE}/api/app-builder/preview`);
console.log("route status:", res.status(), "| type:", res.headers()["content-type"]);
const csp = res.headers()["content-security-policy"] ?? "";
console.log("scoped CSP:", /default-src 'none'/.test(csp), "| unsafe-eval:", /unsafe-eval/.test(csp), "| connect-src none:", /connect-src 'none'/.test(csp));

const page = await ctx.newPage();
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 90000 });
const out = await page.evaluate(async () => {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts");
  f.src = "/api/app-builder/preview";
  f.style.cssText = "position:fixed;left:-9999px;width:400px;height:300px";
  const r = await new Promise((resolve) => {
    const t = setTimeout(() => resolve({ timeout: true }), 40000);
    window.addEventListener("message", function h(e) {
      if (e.source !== f.contentWindow) return;
      const d = e.data; if (!d || !d.__dynRender) return;
      if (d.error) { clearTimeout(t); window.removeEventListener("message", h); resolve({ error: String(d.error) }); return; }
      if (d.probe === "mounted") { clearTimeout(t); window.removeEventListener("message", h); resolve({ ok: true }); return; }
      if (d.ready) f.contentWindow.postMessage({ __dynRenderCode: 'var __DEFAULT_EXPORT__ = () => { parent.postMessage({__dynRender:true, probe:"mounted"}, "*"); return <div className="p-4 text-blue-600">hi</div>; };', dir: "rtl", noDefaultExportMessage: "none" }, "*");
    });
    document.body.appendChild(f);
  });
  f.remove(); return r;
});
console.log("PRODUCTION round trip:", JSON.stringify(out));
await browser.close();
