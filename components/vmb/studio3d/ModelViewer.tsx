"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { createLogger } from "@/lib/logger";
import type { StudioCamera } from "@/lib/projects/pipeline/flat-studio";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import { QUALITY } from "@/lib/projects/scene3d/quality";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";
import { addSceneLights, buildThreeScene } from "@/lib/projects/scene3d/three-scene";
import type { FlatScene } from "@/lib/projects/scene3d/types";

const log = createLogger("vmb-model-viewer");

export type Pose = Pick<StudioCamera, "position" | "target" | "fovDeg">;

export type ViewerLabels = { walls: string; furniture: string; cut: string; hint: string; unavailable: string };

/** The look the flat route renders with (lib/projects/pipeline/flat-measured.ts): what turns here is what was photographed. */
const STYLE = sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_classic);
/** Walls cut at this height when "cut" is on, as the booklet's dollhouse is. */
const CUT_M = 1.1;

/**
 * The measured flat in 3D (plan M3): the very FlatScene the booklet was rendered from, built by scene3d. Stands at the
 * chosen camera; `poseRef` reads where the person turned it to, so the studio can keep that view as a new camera.
 */
export function ModelViewer({
  scene,
  camera,
  poseRef,
  labels,
}: {
  scene: FlatScene;
  camera: StudioCamera | null;
  poseRef: MutableRefObject<(() => Pose) | null>;
  labels: ViewerLabels;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [walls, setWalls] = useState(true);
  const [furniture, setFurniture] = useState(true);
  const [cut, setCut] = useState(false);
  const flags = useRef({ walls, furniture });
  flags.current = { walls, furniture };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        if (disposed || !hostRef.current) return;
        const quality = QUALITY.preview;
        const w = host.clientWidth;
        const h = Math.max(1, host.clientHeight);
        const three = new THREE.Scene();
        three.background = new THREE.Color(0x1c1917);
        const e = scene.extent;
        const centre = new THREE.Vector3(e.x + e.width / 2, 1, e.z + e.depth / 2);
        const cam = new THREE.PerspectiveCamera(camera?.fovDeg ?? 50, w / h, 0.05, 500);
        if (camera) {
          // A camera straight down leaves OrbitControls no "up": nudge it a hair south so it can turn.
          cam.position.set(camera.position.x, camera.position.y, camera.position.z + (camera.top ? 0.01 : 0));
        } else cam.position.set(centre.x, Math.max(e.width, e.depth) * 1.2, centre.z + Math.max(e.width, e.depth) * 0.6);
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(w, h);
        renderer.shadowMap.enabled = quality.shadows;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = STYLE.lighting.exposure;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.replaceChildren(renderer.domElement);
        const controls = new OrbitControls(cam, renderer.domElement);
        const t = camera?.target ?? centre;
        controls.target.set(t.x, t.y, t.z);
        controls.enableDamping = true;
        addSceneLights(THREE, three, scene, STYLE, quality);
        const building = buildThreeScene(THREE, scene, {
          materials: STYLE.materials,
          shadows: quality.shadows,
          ...(cut ? { cutawayM: CUT_M } : {}),
          include: (kind) => kind !== "furniture" && kind !== "prop",
        });
        const pieces = buildThreeScene(THREE, scene, { materials: STYLE.materials, shadows: quality.shadows, include: (kind) => kind === "furniture" || kind === "prop" });
        three.add(building, pieces);

        poseRef.current = () => ({
          position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
          fovDeg: cam.fov,
        });

        let frame = 0;
        const tick = () => {
          frame = requestAnimationFrame(tick);
          building.visible = flags.current.walls;
          pieces.visible = flags.current.furniture;
          controls.update();
          renderer.render(three, cam);
        };
        tick();
        const onResize = () => {
          const el = hostRef.current;
          if (!el) return;
          cam.aspect = el.clientWidth / Math.max(1, el.clientHeight);
          cam.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(host);
        cleanup = () => {
          cancelAnimationFrame(frame);
          ro.disconnect();
          controls.dispose();
          three.traverse((node) => {
            const mesh = node as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
            mesh.geometry?.dispose?.();
            mesh.material?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
          poseRef.current = null;
        };
      } catch (err: unknown) {
        log.warn("3d view unavailable", { error: err instanceof Error ? err.message : String(err) });
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [scene, camera, cut, poseRef]);

  if (failed) return <p className="vmb-card p-4 text-sm text-[color:var(--vmb-muted)]">{labels.unavailable}</p>;

  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" className="h-3.5 w-3.5 accent-[color:var(--vmb-accent)]" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {toggle(walls, setWalls, labels.walls)}
        {toggle(furniture, setFurniture, labels.furniture)}
        {toggle(cut, setCut, labels.cut)}
        <span className="text-[color:var(--vmb-muted)]">{labels.hint}</span>
      </div>
      <div ref={hostRef} className="h-[460px] w-full overflow-hidden rounded-2xl bg-[#1c1917] sm:h-[560px]" />
    </div>
  );
}
