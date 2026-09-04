import { test, expect } from "@playwright/test";
import { gotoAuthenticatedWidget, tryCredentialsSignIn } from "./helpers";

/**
 * Floor-plan visualisation.
 *
 * Split by cost. Everything here runs in CI except the generation flow itself:
 * one run is a handful of Nano Banana Pro calls and several minutes of wall
 * clock, so it sits behind E2E_FLOORPLAN_VIZ=1 the way field-copilot does.
 * What stays in CI is the part that regresses silently — the auth boundary on
 * every route, the validation rejections, and the widget actually mounting.
 */

const RUN_ID = "run_e2e_00000000000000000000";
const STILL_ID = "still_e2e_00000000000000000000";

test.describe("floorplan viz — auth boundary", () => {
  test("every route rejects an anonymous caller", async ({ request }) => {
    const calls = [
      request.get("/api/projects/visualize-floorplan"),
      request.post("/api/projects/visualize-floorplan/style-kit", {
        data: { freeText: "מודרני", audience: "general" },
      }),
      request.get(`/api/projects/visualize-floorplan/${RUN_ID}`),
      request.patch(`/api/projects/visualize-floorplan/${RUN_ID}`, { data: { title: "x" } }),
      request.delete(`/api/projects/visualize-floorplan/${RUN_ID}`),
      request.patch(`/api/projects/visualize-floorplan/${RUN_ID}/stills/${STILL_ID}`, {
        data: { instruction: "יותר אור" },
      }),
      request.delete(`/api/projects/visualize-floorplan/${RUN_ID}/stills/${STILL_ID}`),
      request.get(`/api/projects/visualize-floorplan/${RUN_ID}/stills/${STILL_ID}/file`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(
        [401, 403, 302],
        `${res.url()} must not be reachable without a session`,
      ).toContain(res.status());
    }
  });
});

// page.request, not the standalone `request` fixture: only the page context
// carries the session cookie that tryCredentialsSignIn just established.
test.describe("floorplan viz — authenticated route contract", () => {
  test("rejects a request with no plan file", async ({ page }) => {
    test.skip(!(await tryCredentialsSignIn(page)), "no e2e credentials");
    const res = await page.request.post("/api/projects/visualize-floorplan", {
      multipart: { scope: "full" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("missing_fields");
  });

  test("rejects an oversized plan", async ({ page }) => {
    test.skip(!(await tryCredentialsSignIn(page)), "no e2e credentials");
    const res = await page.request.post("/api/projects/visualize-floorplan", {
      multipart: {
        file: {
          name: "huge.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(16 * 1024 * 1024, 1),
        },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("file_too_large");
  });

  test("export rejects a layout that is not a floor plan", async ({ page }) => {
    test.skip(!(await tryCredentialsSignIn(page)), "no e2e credentials");
    const res = await page.request.post("/api/projects/visualize-floorplan/export-pdf", {
      multipart: { layout: JSON.stringify({ rooms: "not-an-array" }) },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("invalid_layout");
  });

  test("a missing run reads as not-found, not as someone else's run", async ({ page }) => {
    test.skip(!(await tryCredentialsSignIn(page)), "no e2e credentials");
    const res = await page.request.get(`/api/projects/visualize-floorplan/${RUN_ID}`);
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe("viz_run_not_found");
  });
});

test.describe("floorplan viz — widget", () => {
  test("opens from a deep link and mounts without an error boundary", async ({ page }) => {
    test.skip(
      !(await gotoAuthenticatedWidget(page, "floorplanViz")),
      "floorplanViz widget unavailable for this org",
    );
    await expect(page.locator("[data-widget-shell]").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i }),
    ).toHaveCount(0);
  });
});

test.describe("floorplan viz — generation", () => {
  test.skip(
    !process.env.E2E_FLOORPLAN_VIZ,
    "set E2E_FLOORPLAN_VIZ=1 to spend real image-model calls",
  );

  test("generates, persists, serves, and revalidates a still", async ({ page }) => {
    test.skip(!(await tryCredentialsSignIn(page)), "no e2e credentials");
    const plan = await page.request.get("/floorplan-viz/styles/scandi.jpg");
    expect(plan.ok()).toBeTruthy();

    const created = await page.request.post("/api/projects/visualize-floorplan", {
      multipart: {
        file: { name: "plan.jpg", mimeType: "image/jpeg", buffer: await plan.body() },
        scope: "overview",
        planKind: "sales-sheet",
      },
      timeout: 300_000,
    });
    expect(created.ok()).toBeTruthy();
    const body = await created.json();
    expect(Array.isArray(body.images)).toBeTruthy();
    expect(body.images.length).toBeGreaterThan(0);
    expect(body.runId).toBeTruthy();

    // The run must come back on the org's list.
    const list = await page.request.get("/api/projects/visualize-floorplan");
    expect(list.ok()).toBeTruthy();
    expect((await list.json()).runs.some((r: { id: string }) => r.id === body.runId)).toBeTruthy();

    // Bytes are served, and a second request with the validator gets a 304.
    const stillId = body.images[0].id;
    const file = await page.request.get(
      `/api/projects/visualize-floorplan/${body.runId}/stills/${stillId}/file`,
    );
    expect(file.status()).toBe(200);
    const etag = file.headers()["etag"];
    expect(etag).toBeTruthy();
    expect((await file.body()).byteLength).toBeGreaterThan(1000);

    const revalidated = await page.request.get(
      `/api/projects/visualize-floorplan/${body.runId}/stills/${stillId}/file`,
      { headers: { "if-none-match": etag! } },
    );
    expect(revalidated.status()).toBe(304);

    // Clean up so repeated local runs do not pile up 10MB rows.
    const removed = await page.request.delete(`/api/projects/visualize-floorplan/${body.runId}`);
    expect(removed.ok()).toBeTruthy();
  });
});
