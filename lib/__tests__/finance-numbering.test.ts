import { allocateNextDocumentNumber } from "@/lib/finance-numbering";

describe("allocateNextDocumentNumber", () => {
  it("creates sequence at 1001 on first allocate", async () => {
    const upsert = jest.fn().mockResolvedValue({ lastNumber: 1001 });
    const tx = { issuedDocumentSequence: { upsert } } as never;

    const n = await allocateNextDocumentNumber(tx, "org_1", "INVOICE");

    expect(n).toBe(1001);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_type: { organizationId: "org_1", type: "INVOICE" } },
        create: { organizationId: "org_1", type: "INVOICE", lastNumber: 1001 },
        update: { lastNumber: { increment: 1 } },
      }),
    );
  });

  it("returns incremented lastNumber on subsequent allocates", async () => {
    const upsert = jest.fn().mockResolvedValue({ lastNumber: 1005 });
    const tx = { issuedDocumentSequence: { upsert } } as never;

    await expect(allocateNextDocumentNumber(tx, "org_1", "RECEIPT")).resolves.toBe(1005);
  });

  it("produces unique sequential numbers under concurrent allocate mocks", async () => {
    let counter = 1000;
    const upsert = jest.fn().mockImplementation(async () => {
      counter += 1;
      return { lastNumber: counter };
    });
    const tx = { issuedDocumentSequence: { upsert } } as never;

    const results = await Promise.all(
      Array.from({ length: 20 }, () => allocateNextDocumentNumber(tx, "org_x", "INVOICE")),
    );

    expect(new Set(results).size).toBe(20);
    expect(results.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => 1001 + i),
    );
  });
});
