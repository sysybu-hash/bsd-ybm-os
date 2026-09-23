"use client";

import React, { useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import { buildSceneFromPayload } from "@/lib/projects/scene3d/from-payload";
import { buildThreeScene } from "@/lib/projects/scene3d/three-scene";
import { wallPieces } from "@/lib/projects/scene3d/walls";

const log = createLogger("floorplan-viz-3d");

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
  t,
}: {
  geometry: FloorplanGeometryPayload;
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

        const flat = buildSceneFromPayload(geometry);
        const width = flat.extent.width;
        const depth = flat.extent.depth;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1c1917);

        const camera = new THREE.PerspectiveCamera(
          50,
          host.clientWidth / Math.max(1, host.clientHeight),
          0.1,
          500,
        );
        camera.position.set(width * 0.9, Math.max(width, depth) * 0.9, depth * 0.9);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.replaceChildren(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0xfff2e0, 1.2));
        const sun = new THREE.DirectionalLight(0xffe9c9, 2.2);
        sun.position.set(width, Math.max(width, depth), depth);
        scene.add(sun);

        // Two groups, so the layer toggles are a visibility flag rather than a
        // rebuild of the whole scene.
        const building = buildThreeScene(THREE, flat, {
          shadows: false,
          include: (kind) => kind !== "furniture",
        });
        const furniture = buildThreeScene(THREE, flat, {
          shadows: false,
          include: (kind) => kind === "furniture",
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
          camera.aspect = hostRef.current.clientWidth / Math.max(1, hostRef.current.clientHeight);
          camera.updateProjectionMatrix();
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
  }, [geometry, showFurniture, showWalls]);

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
