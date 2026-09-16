"use client";

import React, { useEffect, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import { createLogger } from "@/lib/logger";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";

const log = createLogger("floorplan-viz-3d");

type TFn = (key: string, vars?: Record<string, string>) => string;

const WALL_HEIGHT_M = 2.7;
const LINTEL_M = 0.35;

const ROOM_COLOUR: Record<string, number> = {
  living: 0xf6e0b0,
  kitchen: 0xf3c99a,
  bedroom: 0xbcd4f2,
  mmd: 0xcfc3f2,
  bathroom: 0xa8e4ef,
  balcony: 0xb6e7bd,
  circulation: 0xdcdfe4,
  utility: 0xdcd8d4,
  other: 0xe6e9ee,
};

type Band = FloorplanGeometryPayload["walls"][number];

/**
 * A wall with its doorways taken out.
 *
 * The geometry lists walls and openings separately, each as a run along the
 * wall's own axis. Drawing the wall whole would brick up every door, so each
 * overlapping opening is cut out and a lintel is left above it.
 */
export function wallPieces(wall: Band, openings: Band[]): Array<{ from: number; to: number }> {
  const holes = openings
    .filter(
      (hole) =>
        hole.orientation === wall.orientation &&
        Math.abs(hole.centre - wall.centre) <= Math.max(wall.thickness, hole.thickness) &&
        hole.to > wall.from &&
        hole.from < wall.to,
    )
    .map((hole) => ({ from: Math.max(hole.from, wall.from), to: Math.min(hole.to, wall.to) }))
    .sort((a, b) => a.from - b.from);

  const pieces: Array<{ from: number; to: number }> = [];
  let cursor = wall.from;
  for (const hole of holes) {
    if (hole.from > cursor) pieces.push({ from: cursor, to: hole.from });
    cursor = Math.max(cursor, hole.to);
  }
  if (cursor < wall.to) pieces.push({ from: cursor, to: wall.to });
  return pieces;
}

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

        const m = (value: number) => value / geometry.unitsPerMetre;
        const width = m(geometry.bounds.width);
        const depth = m(geometry.bounds.height);
        const originX = m(geometry.bounds.x) + width / 2;
        const originZ = m(geometry.bounds.y) + depth / 2;

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
        host.replaceChildren(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0xfff2e0, 1.6));
        const sun = new THREE.DirectionalLight(0xffe9c9, 2.2);
        sun.position.set(width, Math.max(width, depth), depth);
        scene.add(sun);

        const walls = new THREE.Group();
        const furniture = new THREE.Group();
        scene.add(walls, furniture);

        const wallMat = new THREE.MeshLambertMaterial({ color: 0xf2ece2 });
        const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: ThreeTypes.Material) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          mesh.position.set(x - originX, y, z - originZ);
          return mesh;
        };

        // Floors, one per room, so the plan reads from above as it does on paper.
        for (const room of geometry.rooms) {
          const colour = ROOM_COLOUR[room.kind] ?? ROOM_COLOUR.other!;
          const plate = box(
            m(room.bounds.width),
            0.02,
            m(room.bounds.height),
            m(room.bounds.x) + m(room.bounds.width) / 2,
            0,
            m(room.bounds.y) + m(room.bounds.height) / 2,
            new THREE.MeshLambertMaterial({ color: colour }),
          );
          scene.add(plate);
        }

        for (const wall of geometry.walls) {
          const across = m(wall.thickness);
          for (const piece of wallPieces(wall, geometry.openings)) {
            const along = m(piece.to - piece.from);
            if (along <= 0.01) continue;
            const mid = m(piece.from) + along / 2;
            const centre = m(wall.centre);
            walls.add(
              wall.orientation === "h"
                ? box(along, WALL_HEIGHT_M, across, mid, WALL_HEIGHT_M / 2, centre, wallMat)
                : box(across, WALL_HEIGHT_M, along, centre, WALL_HEIGHT_M / 2, mid, wallMat),
            );
          }
          // The lintel over each doorway, so an opening reads as a door and not
          // as a wall that simply stops.
          for (const hole of geometry.openings) {
            if (hole.orientation !== wall.orientation) continue;
            if (Math.abs(hole.centre - wall.centre) > Math.max(wall.thickness, hole.thickness)) continue;
            const along = m(Math.min(hole.to, wall.to) - Math.max(hole.from, wall.from));
            if (along <= 0.01) continue;
            const mid = m(Math.max(hole.from, wall.from)) + along / 2;
            const centre = m(wall.centre);
            const y = WALL_HEIGHT_M - LINTEL_M / 2;
            walls.add(
              wall.orientation === "h"
                ? box(along, LINTEL_M, across, mid, y, centre, wallMat)
                : box(across, LINTEL_M, along, centre, y, mid, wallMat),
            );
          }
        }

        const furnitureMat = new THREE.MeshLambertMaterial({ color: 0x9c6b4a });
        for (const piece of geometry.furniture) {
          const h = piece.kind === "bed" ? 0.5 : piece.kind === "table" ? 0.75 : 0.85;
          furniture.add(
            box(m(piece.w), h, m(piece.h), m(piece.x) + m(piece.w) / 2, h / 2, m(piece.y) + m(piece.h) / 2, furnitureMat),
          );
        }

        let frame = 0;
        const tick = () => {
          frame = requestAnimationFrame(tick);
          walls.visible = showWalls;
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
