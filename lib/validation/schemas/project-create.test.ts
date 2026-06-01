import { createProjectWithClientSchema } from "@/lib/validation/schemas/project-create";

describe("createProjectWithClientSchema", () => {
  it("accepts existing client", () => {
    const result = createProjectWithClientSchema.safeParse({
      clientMode: "existing",
      projectName: "וילה",
      contactId: "c1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts new client without email", () => {
    const result = createProjectWithClientSchema.safeParse({
      clientMode: "new",
      projectName: "פרויקט",
      contactName: "לקוח",
      contactPhone: "0501234567",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email for new client", () => {
    const result = createProjectWithClientSchema.safeParse({
      clientMode: "new",
      projectName: "פרויקט",
      contactName: "לקוח",
      contactEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
