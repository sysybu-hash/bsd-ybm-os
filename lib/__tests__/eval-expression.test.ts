import { evalExpression, evalScientificExpression } from "@/lib/calculator/eval-expression";

describe("evalExpression", () => {
  it("evaluates basic arithmetic", () => {
    expect(evalExpression("2+3")).toBe(5);
    expect(evalExpression("10-4")).toBe(6);
    expect(evalExpression("3*7")).toBe(21);
    expect(evalExpression("8/2")).toBe(4);
  });

  it("rejects invalid syntax", () => {
    expect(evalExpression("alert(1)")).toBeNull();
    expect(evalExpression("")).toBeNull();
  });

  it("rejects non-finite results", () => {
    expect(evalExpression("1/0")).toBeNull();
  });
});

describe("evalScientificExpression", () => {
  it("evaluates sin in degrees", () => {
    const result = evalScientificExpression("sin(90)");
    expect(result).not.toBeNull();
    expect(Math.abs((result ?? 0) - 1)).toBeLessThan(0.0001);
  });

  it("evaluates sqrt", () => {
    expect(evalScientificExpression("√(16)")).toBe(4);
  });
});
