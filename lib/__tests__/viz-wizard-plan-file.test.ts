import { planInFile } from "@/components/os/widgets/floorplan-viz/wizard/useVizWizard";

const file = (name: string) => new File(["x"], name);

describe("planInFile", () => {
  const files = [file("tochnit 1_kayam_seminar volf.dxf"), file("tochnit karka_kayam_seminar volf.dxf")];

  it("finds the file a plan of a several-file upload is in, and its id there", () => {
    const hit = planInFile("file:tochnit karka_kayam_seminar volf.dxf:dxf:0", files);
    expect(hit?.file.name).toBe("tochnit karka_kayam_seminar volf.dxf");
    expect(hit?.planRef).toBe("dxf:0");
  });

  it("keeps a name with a colon in it whole", () => {
    const hit = planInFile("file:A:ground.dwf:dwf:3", [file("A:ground.dwf")]);
    expect(hit).toEqual({ file: expect.any(File), planRef: "dwf:3" });
  });

  it("answers nothing for a single file's plan, or a file not uploaded", () => {
    expect(planInFile("dxf:0", files)).toBeNull();
    expect(planInFile("file:other.dxf:dxf:0", files)).toBeNull();
  });
});
