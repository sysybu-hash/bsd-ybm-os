import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { mapLegacyAnalysisTypeToScanMode } from "@/lib/scan/legacy-map";

const mockPersist = jest.fn();
const mockSaveCrm = jest.fn();
const mockCreateExpense = jest.fn();
const mockOrgFind = jest.fn();
const mockWorkDiaryCreate = jest.fn();
const mockProjectFindFirst = jest.fn();
const mockCreateProjectNote = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => mockOrgFind(...a) },
    project: { findFirst: (...a: unknown[]) => mockProjectFindFirst(...a) },
    workDiary: { create: (...a: unknown[]) => mockWorkDiaryCreate(...a) },
  },
}));

jest.mock("@/lib/tri-engine-api-common", () => ({
  persistTriEngineToErp: (...a: unknown[]) => mockPersist(...a),
  buildTriEngineAiDataRecord: jest.fn((v5: unknown) => ({ _built: v5 })),
}));

jest.mock("@/app/actions/save-scanned-document", () => ({
  saveScannedDocumentAction: (...a: unknown[]) => mockSaveCrm(...a),
}));

jest.mock("@/lib/workspace-api/expense-from-scan", () => ({
  createExpenseFromScan: (...a: unknown[]) => mockCreateExpense(...a),
}));

jest.mock("@/lib/workspace-api/project-detail", () => ({
  createProjectNote: (...a: unknown[]) => mockCreateProjectNote(...a),
}));

jest.mock("@/lib/projects/project-access", () => ({
  requireProjectForOrg: async (projectId: string, orgId: string) => {
    const project = await mockProjectFindFirst({ where: { id: projectId, organizationId: orgId } });
    if (!project) return { ok: false as const, response: { status: 404 } };
    return { ok: true as const, project };
  },
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { unifiedSaveScan, buildAiDataForSave } from "@/lib/scan/unified-save";
import { runScanPostActionsServer } from "@/lib/ai/scan-post-actions";
import { isScanUnifiedV2Enabled } from "@/lib/scan/feature-flag";

function sampleV5(overrides?: Partial<ScanExtractionV5>): ScanExtractionV5 {
  return {
    schemaVersion: 5,
    documentMetadata: {
      project: "Demo",
      client: null,
      documentDate: null,
      drawingRefs: null,
      discipline: null,
      sheetIndex: null,
      sourceFileName: "scan.jpg",
      scanMode: "SITE_LOG",
    },
    billOfQuantities: [],
    lineItems: [],
    vendor: "ספק",
    total: 100,
    date: "2026-07-16",
    docType: "SITE_LOG",
    summary: "עבודה באתר",
    priceAlertPending: false,
    ...overrides,
  };
}

describe("legacy map → save targets", () => {
  it("maps analysis types used by save destinations", () => {
    expect(mapLegacyAnalysisTypeToScanMode("INVOICE")).toBe("INVOICE_FINANCIAL");
    expect(mapLegacyAnalysisTypeToScanMode("BLUEPRINT")).toBe("DRAWING_BOQ");
    expect(mapLegacyAnalysisTypeToScanMode("unknown")).toBe("GENERAL_DOCUMENT");
  });
});

describe("feature-flag SCAN_UNIFIED_V2", () => {
  it("defaults to enabled when unset", () => {
    expect(isScanUnifiedV2Enabled()).toBe(true);
  });
});

describe("runScanPostActionsServer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates work_diary when project belongs to org", async () => {
    mockProjectFindFirst.mockResolvedValue({ id: "proj_1", organizationId: "org_1" });
    mockWorkDiaryCreate.mockResolvedValue({ id: "wd_1", isSyncedToAI: true });
    mockCreateProjectNote.mockResolvedValue(undefined);

    const result = await runScanPostActionsServer({
      projectId: "proj_1",
      organizationId: "org_1",
      userId: "user_1",
      v5: sampleV5(),
      policy: {
        screenType: "site_log",
        scanMode: "SITE_LOG",
        primaryModel: "gemini-3.5-flash",
        postActions: ["work_diary", "boq"],
      },
    });

    expect(result.applied).toContain("work_diary");
    expect(result.skipped).toContain("boq");
    expect(mockWorkDiaryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "proj_1",
          organizationId: "org_1",
          createdByUserId: "user_1",
        }),
      }),
    );
  });

  it("skips work_diary without projectId", async () => {
    const result = await runScanPostActionsServer({
      projectId: null,
      organizationId: "org_1",
      userId: "user_1",
      v5: sampleV5(),
      policy: {
        screenType: "site_log",
        scanMode: "SITE_LOG",
        primaryModel: "gemini-3.5-flash",
        postActions: ["work_diary"],
      },
    });
    expect(result.skipped).toContain("work_diary");
    expect(mockWorkDiaryCreate).not.toHaveBeenCalled();
  });

  it("skips work_diary on org mismatch", async () => {
    mockProjectFindFirst.mockResolvedValue(null);
    const result = await runScanPostActionsServer({
      projectId: "proj_foreign",
      organizationId: "org_1",
      userId: "user_1",
      v5: sampleV5(),
      policy: {
        screenType: "site_log",
        scanMode: "SITE_LOG",
        primaryModel: "gemini-3.5-flash",
        postActions: ["work_diary"],
      },
    });
    expect(result.skipped).toContain("work_diary");
    expect(mockWorkDiaryCreate).not.toHaveBeenCalled();
  });
});

describe("unifiedSaveScan", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "scan.jpg", { type: "image/jpeg" });
  const ctx = { userId: "user_1", organizationId: "org_1", industry: "CONSTRUCTION" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPersist.mockResolvedValue({ documentId: "doc_1", driveWebViewLink: null });
    mockSaveCrm.mockResolvedValue({ success: true, documentId: "doc_crm" });
    mockCreateExpense.mockResolvedValue({ id: "exp_1" });
    mockOrgFind.mockResolvedValue({ industry: "CONSTRUCTION" });
  });

  it("saves to erp", async () => {
    const result = await unifiedSaveScan(
      {
        file,
        fileName: "scan.jpg",
        v5: sampleV5(),
        aiData: {},
        target: "erp",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.documentId).toBe("doc_1");
    expect(mockPersist).toHaveBeenCalled();
  });

  it("saves to crm", async () => {
    const result = await unifiedSaveScan(
      {
        file,
        fileName: "scan.jpg",
        v5: sampleV5(),
        aiData: {},
        target: "crm",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        contactId: "c1",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.documentId).toBe("doc_crm");
  });

  it("returns error when crm save fails", async () => {
    mockSaveCrm.mockResolvedValue({ success: false, error: "auth" });
    const result = await unifiedSaveScan(
      {
        file,
        fileName: "scan.jpg",
        v5: sampleV5(),
        aiData: {},
        target: "crm",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CRM|auth/);
  });

  it("saves to expense", async () => {
    const result = await unifiedSaveScan(
      {
        file,
        fileName: "inv.jpg",
        v5: sampleV5({ docType: "INVOICE", documentMetadata: {
          project: null,
          client: null,
          documentDate: null,
          drawingRefs: null,
          discipline: null,
          sheetIndex: null,
          sourceFileName: "inv.jpg",
          scanMode: "INVOICE_FINANCIAL",
        }}),
        aiData: {},
        target: "expense",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(mockCreateExpense).toHaveBeenCalled();
  });

  it("rejects notebook target on server", async () => {
    const result = await unifiedSaveScan(
      {
        file,
        fileName: "scan.jpg",
        v5: sampleV5(),
        aiData: {},
        target: "notebook",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/מחברת/);
  });

  it("project target runs server post-actions for work_diary site log", async () => {
    mockProjectFindFirst.mockResolvedValue({ id: "proj_1", organizationId: "org_1" });
    mockWorkDiaryCreate.mockResolvedValue({ id: "wd_1", isSyncedToAI: false });

    const result = await unifiedSaveScan(
      {
        file,
        fileName: "site-log.jpg",
        v5: sampleV5(),
        aiData: {},
        target: "project",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        projectId: "proj_1",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.appliedPostActions).toEqual(expect.arrayContaining(["work_diary"]));
  });

  it("propagates persist failures as error", async () => {
    mockPersist.mockRejectedValue(new Error("org mismatch"));
    const result = await unifiedSaveScan(
      {
        file,
        fileName: "scan.jpg",
        v5: sampleV5(),
        aiData: {},
        target: "erp",
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/org mismatch/);
  });
});

describe("buildAiDataForSave", () => {
  it("includes v5 payload", () => {
    const v5 = sampleV5();
    const data = buildAiDataForSave(v5);
    expect(data._v5).toEqual(v5);
    expect(data.vendor).toBe("ספק");
  });
});
