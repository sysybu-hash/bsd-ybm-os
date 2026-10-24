import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");

/**
 * The visualizer's function on Vercel only has the files named in
 * next.config.js. The page fetches them by URL, so a missing addon is a
 * request that never draws, and the platform kills the run at 300 seconds.
 */
test("the building page's three addons are packed into the visualizer", () => {
  const config = fs.readFileSync(path.join(root, "next.config.js"), "utf8");
  const page = fs.readFileSync(path.join(root, "lib/projects/building/render-page.ts"), "utf8");
  const specs = [...page.matchAll(/from "three\/addons\/([^"]+)"/g)].map((match) => match[1]!);
  expect(specs.length).toBeGreaterThan(0);
  for (const spec of specs) {
    const folder = spec.split("/")[0]!;
    expect(config).toContain(`jsm/${folder}/**`);
    expect(fs.existsSync(path.join(root, "node_modules/three/examples/jsm", spec))).toBe(true);
  }
});
