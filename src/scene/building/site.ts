// Puts the new building on the site: removes the model's own building, interiors and greenhouse,
// lowers the ground under and behind the new one, builds a retaining wall where the hillside
// rises behind it, and paves the forecourt and the last stretch of the main path.

import { DoubleSide, Group, Mesh, MeshStandardMaterial, Ray, Vector3, type Material, type Object3D } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { arcPoints, Builder, sector } from './builder';
import { greenhouseCorners } from './greenhouse';
import { buildBuilding } from './index';
import { texture } from '../textures';
import { addWasteStations } from '../wasteStations';
import { DEG, I, INNER_OUT, LEVEL, O, OUTER_END, OUTER_OUT, toPolar, type XZ } from './plan';

/** Groups of the Blender model that the new building replaces. */
const REPLACED = new Set(['building', 'floor1', 'floor2', 'greenhouse']);
/** Flat strip behind the outer wall, then the retaining wall. */
const BACK_STRIP = 1.8;
const RETAINING = 0.4;
/** Where the main path from the gate ends today (site-local lx, ly). */
const PATH_END: [number, number] = [3.7, -0.4];

export function insideGreenhouse(p: XZ, margin: number): boolean {
  const [a, b, , d] = greenhouseCorners();
  const u: XZ = [b[0] - a[0], b[1] - a[1]];
  const v: XZ = [d[0] - a[0], d[1] - a[1]];
  const lu = Math.hypot(...u);
  const lv = Math.hypot(...v);
  const s = ((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]) / lu;
  const t = ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / lv;
  return s > -margin && s < lu + margin && t > -margin && t < lv + margin;
}

/** Inside the ring (between the walls' outside faces and the end walls), grown by `margin`. */
export function insideRing(p: XZ, margin: number): boolean {
  const { theta, r } = toPolar(O, p);
  const fromI = toPolar(I, p).r;
  return Math.abs(theta) <= OUTER_END + (margin / Math.max(r, 1)) / DEG && r <= OUTER_OUT + margin && fromI >= INNER_OUT - margin;
}

function behindRing(p: XZ, depth: number): boolean {
  const { theta, r } = toPolar(O, p);
  return Math.abs(theta) <= OUTER_END + 2 && r > OUTER_OUT && r <= OUTER_OUT + depth;
}

export function installBuilding(scene: Object3D, materials: Record<string, Material>) {
  const frame = scene.getObjectByName('SITE_FRAME');
  const terrain = frame?.getObjectByName('Terrain');
  if (!frame || !(terrain instanceof Mesh) || frame.getObjectByName('Building')) return;

  // 1. the model's own building goes
  for (const child of [...frame.children]) {
    if (REPLACED.has(child.userData.group)) frame.remove(child);
  }

  // 2. the new one comes in
  const building = buildBuilding(materials);
  frame.add(building);
  building.updateMatrix();
  const toBuilding = building.matrix.clone().invert();
  const toSite = building.matrix.clone();
  const v = new Vector3();
  const local = (x: number, z: number): XZ => {
    v.set(x, 0, z).applyMatrix4(toBuilding);
    return [v.x, v.z];
  };

  // 3. ground: sample the hillside behind the building first, then lower the terrain
  const geometry = terrain.geometry;
  const position = geometry.getAttribute('position');
  const before = new MeshBVH(geometry);
  const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
  const groundAt = (p: XZ): number => {
    v.set(p[0], 0, p[1]).applyMatrix4(toSite);
    ray.origin.set(v.x, 100, v.z);
    const hit = before.raycastFirst(ray, DoubleSide);
    return hit ? hit.point.y : LEVEL.plaza;
  };
  const wall = new Builder();
  const top = OUTER_OUT + BACK_STRIP;
  const step = 1.5;
  for (let a = -OUTER_END - 2; a < OUTER_END + 2; a += step) {
    const outside = arcPoints(O, top + RETAINING + 0.3, a + step / 2, a + step / 2, 1)[0];
    const height = Math.max(groundAt(outside), groundAt(arcPoints(O, top + RETAINING, a, a, 1)[0]), groundAt(arcPoints(O, top + RETAINING, a + step, a + step, 1)[0]));
    if (height - LEVEL.plaza < 0.25) continue;
    const { poly } = sector(O, top, top + RETAINING, a, a + step);
    wall.prism(poly, LEVEL.plaza - 0.4, height + 0.12, 'retaining', 'retaining');
  }
  for (let i = 0; i < position.count; i++) {
    const p = local(position.getX(i), position.getZ(i));
    const h = position.getY(i);
    if (insideRing(p, 0.3) || insideGreenhouse(p, 0.3)) position.setY(i, Math.min(h, LEVEL.plaza - 0.05));
    else if (behindRing(p, BACK_STRIP + 0.15)) position.setY(i, Math.min(h, LEVEL.plaza));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // the ground sampler builds its BVH again on first use
  geometry.boundsTree = undefined;

  // 4. forecourt paving in front of the entrance, and the path joining the main path
  const paving = new Builder();
  const court = sector(I, 4.6, INNER_OUT, -62, 62);
  paving.cap('paving', court.poly, [], LEVEL.plaza + 0.03, 1);
  const forecourtEdge = arcPoints(I, 4.6, 0, 0, 1)[0];
  const pathEnd = local(PATH_END[0], -PATH_END[1]);
  const dx = pathEnd[0] - forecourtEdge[0];
  const dz = pathEnd[1] - forecourtEdge[1];
  const len = Math.hypot(dx, dz);
  const nx = (-dz / len) * 0.9;
  const nz = (dx / len) * 0.9;
  const y = LEVEL.plaza + 0.04;
  paving.quad('paving', [forecourtEdge[0] + nx, y, forecourtEdge[1] + nz], [pathEnd[0] + nx, y, pathEnd[1] + nz], [pathEnd[0] - nx, y, pathEnd[1] - nz], [forecourtEdge[0] - nx, y, forecourtEdge[1] - nz], [0, 1, 0]);

  const site = new Group();
  site.name = 'BLD_site';
  site.userData.group = 'paths';
  const concrete = new MeshStandardMaterial({ color: '#b9b3a7', roughness: 0.92, side: DoubleSide, map: texture('boardConcrete') });
  concrete.name = 'bld_retaining';
  const pavers = new MeshStandardMaterial({ color: '#cfc7b8', roughness: 0.9, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, map: texture('paving') });
  pavers.name = 'bld_paving';
  for (const [key, g] of [...wall.geometries(), ...paving.geometries()]) {
    const mesh = new Mesh(g, key === 'retaining' ? concrete : pavers);
    mesh.name = `BLD_${key}`;
    if (key === 'paving') mesh.userData.solid = false;
    site.add(mesh);
  }
  // site pieces are in the building frame too
  site.position.copy(building.position);
  site.rotation.copy(building.rotation);
  frame.add(site);
  addWasteStations(frame);
}
