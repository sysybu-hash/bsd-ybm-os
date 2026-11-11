import { cyclesEnabled, cyclesPython } from "@/lib/projects/scene3d/blender-cycles";
import { sceneRendererFor } from "@/lib/projects/scene3d/renderer";

describe("cycles in the render pipeline", () => {
  it("asks Blender for Cycles, a camera and a sun", () => {
    const script = cyclesPython();
    expect(script).toContain('scene.render.engine = "CYCLES"');
    expect(script).toContain("matrix_world");
    expect(script).toContain('"SUN"');
    expect(script).toContain("bpy.ops.render.render");
  });

  it("stays off until the pipeline is pointed at it", () => {
    expect(cyclesEnabled()).toBe(false);
    expect(typeof sceneRendererFor("cycles")).toBe("function");
    expect(typeof sceneRendererFor("chromium")).toBe("function");
  });
});
