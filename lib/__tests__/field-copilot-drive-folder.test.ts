import { buildCaptureFolderName } from "@/lib/field-copilot/archive-to-drive";

describe("buildCaptureFolderName", () => {
  it("formats timestamp in Jerusalem timezone", () => {
    const name = buildCaptureFolderName(new Date("2026-05-24T09:05:07.000Z"), "Asia/Jerusalem");
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });
});
