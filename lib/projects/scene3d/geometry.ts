import type * as ThreeNS from "three";

import type { SceneBox, SceneShape } from "@/lib/projects/scene3d/types";

/**
 * The geometry of a mesh, whatever it is.
 *
 * Isomorphic like three-scene: it takes the THREE namespace and touches no DOM. A mesh is a box, a rounded box, or one of the forms in SceneShape;
 * the result is positioned in scene space (tilted, turned, then moved to the mesh's centre), with position, normal and uv, ready to merge.
 */
type THREE = typeof ThreeNS;

/** A box with every edge and corner rounded to `radius`, smooth-shaded: the box's faces subdivided and pushed out onto the inner box's offset surface. */
export function roundedBoxGeometry(THREE: THREE, w: number, h: number, d: number, radius: number): ThreeNS.BufferGeometry {
  const r = Math.max(0.0005, Math.min(radius, w / 2, h / 2, d / 2));
  const seg = r > 0.02 ? 3 : 2;
  const geo = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)));
    n.copy(v).sub(c);
    if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nor, i);
    n.normalize();
    pos.setXYZ(i, c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  return geo;
}

/** A skin through rings of equal length: quads between each pair of sections, optional caps. */
function loftGeometry(THREE: THREE, sections: Array<{ y: number; ring: Array<[number, number]> }>, capped: boolean): ThreeNS.BufferGeometry {
  const n = sections[0]?.ring.length ?? 0;
  const positions: number[] = [];
  for (const s of sections) for (const [x, z] of s.ring) positions.push(x, s.y, z);
  const indices: number[] = [];
  for (let k = 0; k + 1 < sections.length; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
      indices.push(a, c, b, b, c, d);
    }
  }
  if (capped && sections.length >= 1) {
    for (const [k, up] of [[0, false], [sections.length - 1, true]] as const) {
      const base = positions.length / 3;
      const s = sections[k]!;
      const cx = s.ring.reduce((t, q) => t + q[0], 0) / n;
      const cz = s.ring.reduce((t, q) => t + q[1], 0) / n;
      positions.push(cx, s.y, cz);
      for (let i = 0; i < n; i++) {
        const a = k * n + i, b = k * n + ((i + 1) % n);
        if (up) indices.push(base, b, a);
        else indices.push(base, a, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** The signed area of a ring, positive when it runs counter-clockwise in (x, z). */
const orientation = (pts: Array<[number, number]>): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
};

function shapeGeometry(THREE: THREE, mesh: SceneBox, shape: SceneShape): ThreeNS.BufferGeometry {
  const { x: w, y: h, z: d } = mesh.size;
  switch (shape.kind) {
    case "ellipsoid": {
      const g = new THREE.SphereGeometry(0.5, shape.segments ?? 20, Math.max(8, Math.round((shape.segments ?? 20) / 2)));
      g.scale(w, h, d);
      return g;
    }
    case "lathe": {
      const pts = shape.profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
      return new THREE.LatheGeometry(pts, shape.segments ?? 28);
    }
    case "extrude": {
      const pts = orientation(shape.outline) < 0 ? [...shape.outline].reverse() : shape.outline;
      const s2 = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const hole of shape.holes ?? []) s2.holes.push(new THREE.Path((orientation(hole) > 0 ? [...hole].reverse() : hole).map(([x, z]) => new THREE.Vector2(x, -z))));
      const bevel = Math.max(0, Math.min(shape.bevel ?? 0, h / 2 - 0.0005, Math.min(w, d) / 2 - 0.0005));
      const g = new THREE.ExtrudeGeometry(s2, {
        depth: Math.max(0.001, h - 2 * bevel),
        bevelEnabled: bevel > 0.0005,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
        curveSegments: 16,
      });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -h / 2 + bevel, 0);
      return g;
    }
    case "loft":
      return loftGeometry(THREE, shape.sections, shape.capped !== false);
    case "sweep": {
      const curve = new THREE.CatmullRomCurve3(shape.path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, "centripetal");
      return new THREE.TubeGeometry(curve, Math.max(8, shape.path.length * 8), shape.radius, shape.segments ?? 10, false);
    }
    case "mesh": {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(shape.positions, 3));
      g.setIndex(shape.indices);
      g.computeVertexNormals();
      return g;
    }
  }
}

/** One mesh as geometry in scene space. */
export function meshGeometry(THREE: THREE, mesh: SceneBox): ThreeNS.BufferGeometry {
  const own = mesh.local ?? mesh.size;
  const { x: w, y: h, z: d } = own;
  let geo: ThreeNS.BufferGeometry;
  if (mesh.shape) geo = shapeGeometry(THREE, { ...mesh, size: own }, mesh.shape);
  else if (mesh.round && mesh.round > 0.001) geo = roundedBoxGeometry(THREE, w, h, d, mesh.round);
  else geo = new THREE.BoxGeometry(w, h, d);
  // A form squashed to a cutaway plane: its height is the mesh's, its footprint its own.
  if (mesh.local && Math.abs(mesh.local.y - mesh.size.y) > 1e-9 && mesh.local.y > 0) geo.scale(1, mesh.size.y / mesh.local.y, 1);
  if (mesh.tiltX) geo.rotateX(mesh.tiltX);
  if (mesh.tiltZ) geo.rotateZ(mesh.tiltZ);
  if (mesh.rotY) geo.rotateY(mesh.rotY);
  geo.translate(mesh.centre.x, mesh.centre.y, mesh.centre.z);
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
  return geo;
}

/**
 * A mesh as plain arrays — what a page without the engine's code can draw: indexed positions (4 decimals) in scene space. The page computes the normals.
 * Null for a plain box, which the page already knows how to make from its centre and size.
 */
export function meshArrays(THREE: THREE, mesh: SceneBox): { p: number[]; i: number[] } | null {
  if (!mesh.shape && !(mesh.round && mesh.round > 0.001) && !mesh.tiltX && !mesh.tiltZ && !mesh.rotY) return null;
  const geo = meshGeometry(THREE, mesh);
  const indexed = geo.index ? geo : null;
  const pos = geo.getAttribute("position");
  const p: number[] = [];
  for (let k = 0; k < pos.count * 3; k++) p.push(Math.round((pos.array as ArrayLike<number>)[k]! * 10000) / 10000);
  const i = indexed ? Array.from(indexed.index!.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, k) => k);
  geo.dispose();
  return { p, i };
}
