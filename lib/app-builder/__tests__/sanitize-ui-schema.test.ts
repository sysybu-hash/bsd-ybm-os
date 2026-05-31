import { buildPayloadFromFormData } from "@/lib/app-builder/coerce-form-data";
import {
  extractJsonFromModelText,
  parseAndSanitizeUiSchema,
} from "@/lib/app-builder/sanitize-ui-schema";

const validForm = {
  type: "form" as const,
  title: "טופס לקוח",
  fields: [
    { name: "clientName", label: "שם לקוח", type: "text" as const, required: true },
    { name: "amount", label: "סכום", type: "number" as const },
    { name: "agree", label: "מסכים", type: "checkbox" as const },
  ],
};

const validDashboard = {
  type: "dashboard" as const,
  title: "דשבורד פרויקטים",
  components: [
    {
      id: "projects_by_status",
      type: "bar_chart" as const,
      title: "פרויקטים לפי סטטוס",
      dataConfig: {
        targetTable: "projects" as const,
        aggregation: "count" as const,
        groupBy: "status",
      },
    },
  ],
};

const validComposer = {
  type: "composer" as const,
  title: "מרכז שליטה",
  blocks: [
    {
      id: "kpi",
      kind: "dashboard" as const,
      components: [
        {
          id: "metric_projects",
          type: "metric_card" as const,
          title: "פרויקטים",
          dataConfig: {
            targetTable: "projects" as const,
            aggregation: "count" as const,
          },
        },
      ],
    },
    {
      id: "form1",
      kind: "form" as const,
      fields: [{ name: "note", label: "הערה", type: "text" as const }],
    },
    {
      id: "actions1",
      kind: "actions" as const,
      actions: [{ id: "crm", label: "פתח CRM", intent: "open_crm" }],
    },
    {
      id: "help",
      kind: "text" as const,
      body: "הוראות שימוש",
    },
  ],
};

describe("parseAndSanitizeUiSchema", () => {
  it("accepts valid form schema", () => {
    const result = parseAndSanitizeUiSchema(validForm);
    expect(result.ok).toBe(true);
    if (result.ok && result.schema.type === "form") {
      expect(result.schema.fields).toHaveLength(3);
    }
  });

  it("accepts valid dashboard schema", () => {
    const result = parseAndSanitizeUiSchema(validDashboard);
    expect(result.ok).toBe(true);
    if (result.ok && result.schema.type === "dashboard") {
      expect(result.schema.components).toHaveLength(1);
    }
  });

  it("accepts valid composer schema", () => {
    const result = parseAndSanitizeUiSchema(validComposer);
    expect(result.ok).toBe(true);
    if (result.ok && result.schema.type === "composer") {
      expect(result.schema.blocks).toHaveLength(4);
    }
  });

  it("rejects composer with two form blocks", () => {
    const result = parseAndSanitizeUiSchema({
      ...validComposer,
      blocks: [
        ...validComposer.blocks,
        { id: "form2", kind: "form", fields: [{ name: "x", label: "X", type: "text" }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("composer_single_form_block");
    }
  });

  it("rejects chart without dataConfig", () => {
    const result = parseAndSanitizeUiSchema({
      type: "dashboard",
      title: "Bad",
      components: [{ id: "x", type: "bar_chart", title: "Chart" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = parseAndSanitizeUiSchema({
      ...validForm,
      href: "/admin",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects script in label", () => {
    const result = parseAndSanitizeUiSchema({
      type: "form",
      fields: [{ name: "x", label: "<script>alert(1)</script>", type: "text" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("field_contains_forbidden_content");
    }
  });

  it("rejects admin paths in title", () => {
    const result = parseAndSanitizeUiSchema({
      type: "form",
      title: "Go to /admin",
      fields: [{ name: "x", label: "X", type: "text" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects select without options", () => {
    const result = parseAndSanitizeUiSchema({
      type: "form",
      fields: [{ name: "status", label: "Status", type: "select" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("select_requires_options");
    }
  });
});

describe("extractJsonFromModelText", () => {
  it("parses fenced json block", () => {
    const raw = extractJsonFromModelText('```json\n{"type":"form","fields":[]}\n```');
    expect(raw).toEqual({ type: "form", fields: [] });
  });

  it("parses raw json object", () => {
    const raw = extractJsonFromModelText('{"type":"table","fields":[{"name":"a","label":"A","type":"text"}]}');
    expect(raw).toMatchObject({ type: "table" });
  });
});

describe("buildPayloadFromFormData", () => {
  it("coerces allowed fields only", () => {
    const result = buildPayloadFromFormData(
      { clientName: "  דני  ", amount: "42.5", agree: "on" },
      validForm,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.clientName).toBe("דני");
      expect(result.payload.amount).toBe(42.5);
      expect(result.payload.agree).toBe(true);
    }
  });

  it("rejects unexpected fields", () => {
    const result = buildPayloadFromFormData(
      { clientName: "x", evil: "y" },
      validForm,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^unexpected_field:/);
    }
  });

  it("rejects missing required field", () => {
    const result = buildPayloadFromFormData({ amount: "1" }, validForm);
    expect(result.ok).toBe(false);
  });

  it("rejects dashboard schema", () => {
    const result = buildPayloadFromFormData({}, validDashboard);
    expect(result.ok).toBe(false);
  });

  it("coerces composer form block fields", () => {
    const result = buildPayloadFromFormData({ note: "  hello  " }, validComposer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.note).toBe("hello");
    }
  });
});
