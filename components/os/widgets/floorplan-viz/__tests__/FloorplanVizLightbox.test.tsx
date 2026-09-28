import { render, screen } from "@testing-library/react";
import FloorplanVizLightbox from "../FloorplanVizLightbox";

const t = (key: string) => key;
const image = { viewId: "overview", labelHe: "מבט על", mimeType: "image/png", base64: "iVBORw0KGgo=" };

describe("the enlarged still's toolbar", () => {
  it("draws its buttons dark on the black backdrop, not as blank white squares", () => {
    // The shared quiet-button paints the card surface; on the black backdrop
    // that came out as five white squares with white icons on them.
    render(
      <FloorplanVizLightbox t={t} images={[image as never]} index={0} onClose={() => {}} onIndex={() => {}} />,
    );
    const toolbar = screen.getByRole("dialog").firstElementChild as HTMLElement;
    const buttons = [...toolbar.querySelectorAll("button, a")];
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.className).toContain("!bg-white/10");
      expect(button.className).toContain("!text-white");
    }
  });
});
