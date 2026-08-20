import { escapeEmbeddedScript } from "@/components/os/widgets/shared/DynamicSandpackRenderer";

describe("escapeEmbeddedScript", () => {
  it("neutralizes script close tags in injected source", () => {
    expect(escapeEmbeddedScript('const x = "</script><script>alert(1)</script>"')).toBe(
      'const x = "<\\/script><script>alert(1)<\\/script>"',
    );
    expect(escapeEmbeddedScript("ok </SCRIPT>")).toBe("ok <\\/script>");
  });
});
