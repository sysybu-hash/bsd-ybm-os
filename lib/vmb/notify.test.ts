jest.mock("server-only", () => ({}));

const mockSend = jest.fn();
jest.mock("@/lib/mail-core", () => ({
  escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  sendTransactionalEmail: (...a: unknown[]) => mockSend(...a),
}));
const mockDb = { vmbProject: { findUnique: jest.fn() }, vmbUser: { findUnique: jest.fn() } };
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { jobEndMail, notifyJobEnd } from "@/lib/vmb/notify";

describe("VMB job mail", () => {
  beforeEach(() => jest.resetAllMocks());

  it("escapes the project name and links the project", () => {
    const m = jobEndMail("<b>בית</b>", "https://vmb.example/app/p/p1", { kind: "done" });
    expect(m.html).toContain("&lt;b&gt;בית&lt;/b&gt;");
    expect(m.html).toContain('href="https://vmb.example/app/p/p1"');
    expect(m.subject).toContain("<b>בית</b>");
  });

  it("a stop says the engine's words, a fault says the plain sentence, and both say nothing was charged", () => {
    expect(jobEndMail("x", "u", { kind: "stopped", message: "קובץ DWG צריך המרה" }).html).toContain("קובץ DWG צריך המרה");
    const fault = jobEndMail("x", "u", { kind: "stopped", message: null }).html;
    expect(fault).toContain("משהו נכשל אצלנו");
    expect(fault).toContain("לא חויבתם");
  });

  it("goes to the project's creator, and never fails the caller", async () => {
    mockDb.vmbProject.findUnique.mockResolvedValue({ name: "בית", createdById: "u1", workspace: { members: [{ user: { id: "o", email: "owner@x.co" } }] } });
    mockDb.vmbUser.findUnique.mockResolvedValue({ email: "maker@x.co" });
    mockSend.mockResolvedValue({ ok: true });
    await notifyJobEnd("p1", { kind: "done" });
    expect(mockSend.mock.calls[0][0]).toEqual(["maker@x.co"]);
    mockSend.mockRejectedValue(new Error("smtp down"));
    await expect(notifyJobEnd("p1", { kind: "done" })).resolves.toBeUndefined();
  });
});
