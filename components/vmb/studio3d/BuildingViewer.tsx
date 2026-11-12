"use client";

import { useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { BuildingStudioModel } from "@/lib/projects/pipeline/building-studio";
import type { StudioCamera } from "@/lib/projects/pipeline/flat-studio";

const log = createLogger("vmb-building-viewer");

export type BuildingViewerLabels = { whole: string; storey: string; section: string; site: string; hint: string; unavailable: string };

const FAR = 1e5;

/**
 * A house or a building in 3D (plan M3): the primitives the booklet was rendered from. A storey picked cuts everything
 * above its ceiling away, so its rooms show from above; "section" cuts the building through its middle.
 */
export function BuildingViewer({ model, camera, labels }: { model: BuildingStudioModel; camera: StudioCamera | null; labels: BuildingViewerLabels }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [storey, setStorey] = useState<string>("");
  const [section, setSection] = useState(false);
  const [site, setSite] = useState(true);
  const planes = useRef<{ top: { constant: number }; cut: { constant: number }; site: { visible: boolean } | null } | null>(null);
  const storeys = model.storeys.filter((s) => !s.roof);

  // The cuts move planes the materials already clip by: no rebuild.
  useEffect(() => {
    const p = planes.current;
    if (!p) return;
    const s = storeys.find((x) => x.id === storey);
    p.top.constant = s ? s.level + Math.min(s.height, 3.2) - 0.05 : FAR;
    p.cut.constant = section ? model.extent.z + model.extent.depth / 2 : FAR;
    if (p.site) p.site.visible = site;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { buildPrimitives } = await import("@/lib/projects/building/three-primitives");
        if (disposed || !hostRef.current) return;
        const w = host.clientWidth;
        const h = Math.max(1, host.clientHeight);
        const e = model.extent;
        const centre = new THREE.Vector3(e.x + e.width / 2, (e.yMin + e.yMax) / 2, e.z + e.depth / 2);
        const span = Math.max(e.width, e.depth, e.yMax - e.yMin);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xdfe6ec);
        const cam = new THREE.PerspectiveCamera(camera?.fovDeg ?? 45, w / h, 0.1, span * 40);
        if (camera) cam.position.set(camera.position.x, camera.position.y, camera.position.z);
        else cam.position.set(centre.x + span * 1.1, centre.y + span * 0.8, centre.z + span * 1.3);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.setSize(w, h);
        renderer.localClippingEnabled = true;
        renderer.shadowMap.enabled = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.replaceChildren(renderer.domElement);
        const controls = new OrbitControls(cam, renderer.domElement);
        const t = camera?.target ?? centre;
        controls.target.set(t.x, t.y, t.z);
        controls.enableDamping = true;

        const top = new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR);
        const cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), FAR);
        const clip = [top, cut];
        const isSite = (tag?: string) => !!tag && /^(site|yard|street)(:|$)/.test(tag);
        const building = buildPrimitives(THREE, model.primitives, { clip, include: (p) => !isSite(p.tag) });
        const ground = buildPrimitives(THREE, model.primitives, { include: (p) => isSite(p.tag) });
        scene.add(building, ground);
        planes.current = { top, cut, site: ground };

        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.1));
        const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
        sun.position.set(centre.x - span, centre.y + span * 1.5, centre.z + span * 0.7);
        sun.target.position.copy(centre);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera as InstanceType<typeof THREE.OrthographicCamera>;
        sc.left = sc.bottom = -span;
        sc.right = sc.top = span;
        sc.far = span * 6;
        scene.add(sun, sun.target);

        let frame = 0;
        const tick = () => {
          frame = requestAnimationFrame(tick);
          controls.update();
          renderer.render(scene, cam);
        };
        tick();
        const ro = new ResizeObserver(() => {
          const el = hostRef.current;
          if (!el) return;
          cam.aspect = el.clientWidth / Math.max(1, el.clientHeight);
          cam.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
        });
        ro.observe(host);
        cleanup = () => {
          cancelAnimationFrame(frame);
          ro.disconnect();
          controls.dispose();
          scene.traverse((node) => {
            const mesh = node as { geometry?: { dispose?: () => void } };
            mesh.geometry?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
          planes.current = null;
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
  }, [model, camera]);

  if (failed) return <p className="vmb-card p-4 text-sm text-[color:var(--vmb-muted)]">{labels.unavailable}</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          {labels.storey}
          <select value={storey} onChange={(e) => setStorey(e.target.value)} className="rounded-lg border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-raised)] px-2 py-1">
            <option value="">{labels.whole}</option>
            {storeys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="h-3.5 w-3.5 accent-[color:var(--vmb-accent)]" checked={section} onChange={(e) => setSection(e.target.checked)} />
          {labels.section}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="h-3.5 w-3.5 accent-[color:var(--vmb-accent)]" checked={site} onChange={(e) => setSite(e.target.checked)} />
          {labels.site}
        </label>
        <span className="text-[color:var(--vmb-muted)]">{labels.hint}</span>
      </div>
      <div ref={hostRef} className="h-[460px] w-full overflow-hidden rounded-2xl bg-[#dfe6ec] sm:h-[560px]" />
    </div>
  );
}
