/**
 * @jest-environment node
 */
import { resolveApiErrorMessage } from "@/lib/client/parse-json-response";

/** Mirrors useI18n: an unknown key comes back as the key itself. */
const dict: Record<string, string> = {
  "apiErrors.invalid_email": "Invalid email",
  "apiErrors.missing_file": "No file provided",
  "common.errors.unknown": "Something went wrong",
};
const t = (key: string) => dict[key] ?? key;

describe("resolveApiErrorMessage", () => {
  it("translates a known code, ignoring the server's own message", () => {
    const out = resolveApiErrorMessage({ error: "אימייל לא תקין", code: "invalid_email" }, t);
    expect(out).toBe("Invalid email");
  });

  // The whole point of the fallback: an unmapped code must keep showing exactly
  // what it shows today, so codes can be adopted gradually without regressions.
  it("falls back to the server message when the code has no translation", () => {
    const out = resolveApiErrorMessage(
      { error: "מספר מסמך 1234 כבר קיים לסוג זה.", code: "document_number_taken" },
      t,
    );
    expect(out).toBe("מספר מסמך 1234 כבר קיים לסוג זה.");
  });

  it("falls back to the server message when there is no code at all", () => {
    expect(resolveApiErrorMessage({ error: "שגיאה כלשהי" }, t)).toBe("שגיאה כלשהי");
  });

  it("never returns a raw message key", () => {
    const out = resolveApiErrorMessage({ code: "totally_unknown_code" }, t);
    expect(out).toBe("Something went wrong");
    expect(out.startsWith("apiErrors.")).toBe(false);
  });

  it("prefers an explicit fallback over the generic unknown message", () => {
    const out = resolveApiErrorMessage({ code: "totally_unknown_code" }, t, "Upload failed");
    expect(out).toBe("Upload failed");
  });

  it.each([undefined, {}, { error: 42 }, { code: 7 }])(
    "survives a malformed body: %j",
    (body) => {
      expect(typeof resolveApiErrorMessage(body as never, t)).toBe("string");
    },
  );

  it("does not treat an empty translation as a hit", () => {
    const emptyT = (key: string) => (key === "apiErrors.missing_file" ? "" : key);
    expect(resolveApiErrorMessage({ error: "לא נמצא קובץ", code: "missing_file" }, emptyT)).toBe(
      "לא נמצא קובץ",
    );
  });
});
