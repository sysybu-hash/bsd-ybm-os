import { runContactEmbeddingsCron } from "@/lib/crm/contact-embedding-cron";
import { prisma } from "@/lib/prisma";
import { isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";
import { syncContactEmbeddingsForOrg } from "@/lib/crm/contact-embedding-index";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/embeddings/gemini-embed", () => ({
  isEmbeddingConfigured: jest.fn(),
}));

jest.mock("@/lib/crm/contact-embedding-index", () => ({
  syncContactEmbeddingsForOrg: jest.fn(),
}));

describe("runContactEmbeddingsCron", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips when embeddings not configured", async () => {
    (isEmbeddingConfigured as jest.Mock).mockReturnValue(false);
    const result = await runContactEmbeddingsCron();
    expect(result.skipped).toBe(true);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  it("syncs all organizations", async () => {
    (isEmbeddingConfigured as jest.Mock).mockReturnValue(true);
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([{ id: "o1" }, { id: "o2" }]);
    (syncContactEmbeddingsForOrg as jest.Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    const result = await runContactEmbeddingsCron();
    expect(result.organizations).toBe(2);
    expect(result.embeddingsUpdated).toBe(2);
    expect(result.skipped).toBe(false);
  });
});
