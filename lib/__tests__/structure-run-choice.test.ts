import type { StructureChoiceRecord } from "@/lib/projects/structure/report-cache";

const record: StructureChoiceRecord = {
  structure: "commercial",
  sure: true,
  planIds: ["dxf:0", "dxf:1", "dxf:2"],
  blockedPlanIds: ["dxf:2"],
  blockers: [],
};

jest.mock("@/lib/projects/structure/report-cache", () => {
  const actual = jest.requireActual("@/lib/projects/structure/report-cache");
  return {
    ...actual,
    recallStructure: jest.fn(async () => record),
    rememberStructure: jest.fn(async () => undefined),
  };
});
jest.mock("@/lib/projects/structure/identify", () => ({
  identifyStructure: jest.fn(async () => {
    throw new Error("the cached record should have been used");
  }),
}));
jest.mock("@/lib/env", () => ({ env: { VERCEL_GIT_COMMIT_SHA: "abc" } }));

import { structureFingerprint } from "@/lib/projects/structure/report-cache";
import { resolveConfirmedChoice } from "@/lib/projects/structure/run-choice";

const bytes = Buffer.from("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n");
const base = { orgId: "org", fileName: "pisga.dxf", bytes, fingerprint: "" };

describe("resolveConfirmedChoice", () => {
  it("leaves a run with no choice to guess as before", async () => {
    const r = await resolveConfirmedChoice({ ...base, structure: "", planRef: "" });
    expect(r).toMatchObject({ ok: true, choice: null });
  });

  it("takes a plan the file holds, as its DXF plan index", async () => {
    const r = await resolveConfirmedChoice({ ...base, structure: "commercial", planRef: "dxf:1" });
    expect(r.ok && r.choice).toEqual({ structure: "commercial", planRef: "dxf:1", planIndex: 1 });
  });

  it("refuses a plan the file does not hold, and a blocked one", async () => {
    expect(await resolveConfirmedChoice({ ...base, structure: "commercial", planRef: "dxf:7" })).toMatchObject({
      ok: false,
      code: "plan_not_in_file",
    });
    expect(await resolveConfirmedChoice({ ...base, structure: "commercial", planRef: "dxf:2" })).toMatchObject({
      ok: false,
      code: "plan_blocked",
    });
  });

  it("refuses a choice made for another file", async () => {
    const r = await resolveConfirmedChoice({ ...base, structure: "commercial", planRef: "dxf:0", fingerprint: "f".repeat(64) });
    expect(r).toMatchObject({ ok: false, code: "structure_mismatch" });
    const same = structureFingerprint([{ name: base.fileName, bytes }]);
    expect((await resolveConfirmedChoice({ ...base, structure: "commercial", planRef: "dxf:0", fingerprint: same })).ok).toBe(true);
  });

  it("sends a house to its booklet and refuses an unknown structure name", async () => {
    expect(await resolveConfirmedChoice({ ...base, structure: "house", planRef: "" })).toMatchObject({
      ok: false,
      code: "structure_not_produced_here",
    });
    expect(await resolveConfirmedChoice({ ...base, structure: "castle", planRef: "" })).toMatchObject({
      ok: false,
      code: "invalid_structure",
    });
  });
});
