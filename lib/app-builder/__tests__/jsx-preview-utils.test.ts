import {
  isLikelyReactComponent,
  looksLikeUiBuildRequest,
  sanitizeGeneratedJsx,
} from "@/lib/app-builder/jsx-preview-utils";

describe("jsx-preview-utils", () => {
  it("detects default-export React components", () => {
    const code = `export default function App() {
  return <div>Hello</div>;
}`;
    expect(isLikelyReactComponent(code)).toBe(true);
  });

  it("rejects prose-only model output", () => {
    expect(isLikelyReactComponent("Here is your component:")).toBe(false);
  });

  it("extracts JSX from markdown fences", () => {
    const raw = "```jsx\nexport default function App(){return <div />}\n```";
    expect(sanitizeGeneratedJsx(raw)).toBe("export default function App(){return <div />}");
  });

  it("recognizes Hebrew UI build requests", () => {
    expect(looksLikeUiBuildRequest("בנה לי דשבורד עם 3 כרטיסי מטריקה")).toBe(true);
    expect(looksLikeUiBuildRequest("מה שלומך?")).toBe(false);
  });
});
