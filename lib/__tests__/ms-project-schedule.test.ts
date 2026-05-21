import fs from "node:fs";
import path from "node:path";
import { parseMsProjectXml, parseScheduleCsv } from "@/lib/imports/ms-project-schedule";

describe("ms-project-schedule", () => {
  it("parses minimal MS Project XML fixture", () => {
    const xml = fs.readFileSync(
      path.join(process.cwd(), "e2e/fixtures/schedule-minimal.xml"),
      "utf8",
    );
    const tasks = parseMsProjectXml(xml);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.some((t) => t.title.includes("שלב") || t.progress === 25)).toBe(true);
  });

  it("parses minimal schedule CSV fixture", () => {
    const csv = fs.readFileSync(
      path.join(process.cwd(), "e2e/fixtures/quote-minimal.csv"),
      "utf8",
    );
    const tasks = parseScheduleCsv(csv);
    expect(tasks.length).toBe(2);
    expect(tasks.length).toBeGreaterThan(0);
  });
});
