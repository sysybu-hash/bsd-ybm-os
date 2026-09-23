"use client";

import React, { useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import {
  DEFAULT_FLOORPLAN_VIZ_STYLE_ID,
  FLOORPLAN_VIZ_PRESETS,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";
import { cameraFor } from "@/lib/projects/scene3d/cameras";
import { buildSceneFromPayload } from "@/lib/projects/scene3d/from-payload";
import { QUALITY } from "@/lib/projects/scene3d/quality";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";
import { addSceneLights, buildThreeScene, cameraFromRig } from "@/lib/projects/scene3d/three-scene";
import { wallPieces } from "@/lib/projects/scene3d/walls";

const log = createLogger("floorplan-viz-3d");

/** A run saved before styles were kept still has to draw as something. */
const FALLBACK_KIT = FLOORPLAN_VIZ_PRESETS[DEFAULT_FLOORPLAN_VIZ_STYLE_ID];

type TFn = (key: string, vars?: Record<string, string>) => string;

/**
 * The measured flat, drawn.
 *
 * The geometry it builds is no longer this component's own: it comes from
 * lib/projects/scene3d, the same scene model the deterministic renderer
 * photographs for the booklet. What you turn around here is what will be
 * delivered, and a bug fixed in one is fixed in both.
 */

/** Re-exported where it has always been, for the viewer's own test. */
export { wallPieces };

export default function FloorplanViz3DViewer({
  geometry,
  styleKit,
  t,
}: {
  geometry: FloorplanGeometryPayload;
  /** The run's own style, so the viewer shows the finishes it will ship. */
  styleKit?: FloorplanVizStyleKit;
  t: TFn;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [showFurniture, setShowFurniture] = useState(true);
  const [showWalls, setShowWalls] = useState(true);

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

        const style = sceneStyleFor(styleKit ?? FALLBACK_KIT);
        const quality = QUALITY.preview;
        const flat = buildSceneFromPayload(geometry, { rules: style.rules });
        const aspect = host.clientWidth / Math.max(1, host.clientHeight);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1c1917);

        const rig = cameraFor(flat, { id: "overview" }, aspect);
        const camera = cameraFromRig(THREE, rig, aspect);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.shadowMap.enabled = quality.shadows;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = style.lighting.exposure;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.replaceChildren(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(rig.target.x, rig.target.y, rig.target.z);
        controls.enableDamping = true;

        addSceneLights(THREE, scene, flat, style, quality);

        // Two groups, so the layer toggles are a visibility flag rather than a
        // rebuild of the whole scene. Walls are cut where the rig asks, which
        // is how every room is visible from above.
        const building = buildThreeScene(THREE, flat, {
          materials: style.materials,
          shadows: quality.shadows,
          cutawayM: rig.cutawayM,
          include: (kind) => kind !== "furniture",
        });
        const furniture = buildThreeScene(THREE, flat, {
          materials: style.materials,
          shadows: quality.shadows,
          include: (kind) => kind === "furniture" || kind === "prop",
        });
        scene.add(building, furniture);

        let frame = 0;
        const tick = () => {
          frame = requestAnimationFrame(tick);
          building.visible = showWalls;
          furniture.visible = showFurniture;
          controls.update();
          renderer.render(scene, camera);
        };
        tick();

        const onResize = () => {
          if (!hostRef.current) return;
          const next = hostRef.current.clientWidth / Math.max(1, hostRef.current.clientHeight);
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.aspect = next;
            camera.updateProjectionMatrix();
          }
          renderer.setSize(hostRef.current.clientWidth, hostRef.current.clientHeight);
        };
        window.addEventListener("resize", onResize);

        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", onResize);
          controls.dispose();
          scene.traverse((node) => {
            const mesh = node as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
            mesh.geometry?.dispose?.();
            mesh.material?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (err: unknown) {
        log.warn("3d view unavailable", {
          error: err instanceof Error ? err.message : String(err),
        });
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [geometry, showFurniture, showWalls, styleKit]);

  if (failed) {
    return (
      <p className="rounded-xl border border-[color:var(--border-main)] p-4 text-sm text-[color:var(--foreground-muted)]">
        {t("workspaceWidgets.floorplanViz.view3dUnavailable")}
      </p>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="size-3.5 accent-violet-600" checked={showWalls} onChange={(e) => setShowWalls(e.target.checked)} />
          {t("workspaceWidgets.floorplanViz.layerWalls")}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="size-3.5 accent-violet-600" checked={showFurniture} onChange={(e) => setShowFurniture(e.target.checked)} />
          {t("workspaceWidgets.floorplanViz.layerFurniture")}
        </label>
        <span className="text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.floorplanViz.view3dHint")}
        </span>
      </div>
      <div ref={hostRef} className="h-[420px] w-full overflow-hidden rounded-xl bg-neutral-900" />
    </section>
  );
}
