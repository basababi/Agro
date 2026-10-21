// Collects triangles per material key and turns them into geometries. Everything here is in the
// building frame (X right, Y up, Z towards the viewer of the drawing), in metres; UVs are in metres
// too (walls: along the wall × height, floors: X × Z), so tiling textures keep their real size.

import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three';
import type { XZ } from './plan';

export type V3 = [number, number, number];

interface Bucket {
  positions: number[];
  normals: number[];
  uvs: number[];
}

const e1 = new Vector3();
const e2 = new Vector3();
const n = new Vector3();

export class Builder {
  private buckets = new Map<string, Bucket>();

  private bucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, (bucket = { positions: [], normals: [], uvs: [] }));
    return bucket;
  }

  /** One flat triangle; it is flipped if needed so that its normal points along `toward`. */
  triangle(key: string, a: V3, b: V3, c: V3, uv: [V3, V3, V3] | ((p: V3) => [number, number]), toward?: V3) {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-14) return;
    n.normalize();
    let points = [a, b, c];
    if (toward && n.x * toward[0] + n.y * toward[1] + n.z * toward[2] < 0) {
      points = [a, c, b];
      n.negate();
    }
    const bucket = this.bucket(key);
    for (const p of points) {
      bucket.positions.push(p[0], p[1], p[2]);
      bucket.normals.push(n.x, n.y, n.z);
      const [u, v] = typeof uv === 'function' ? uv(p) : [0, 0];
      bucket.uvs.push(u, v);
    }
  }

  /** A planar four-cornered face looking along `toward`, textured by projection on its own plane. */
  quad(key: string, a: V3, b: V3, c: V3, d: V3, toward: V3) {
    const uv = planarUV(a, b, d, toward);
    this.triangle(key, a, b, c, uv, toward);
    this.triangle(key, a, c, d, uv, toward);
  }

  /**
   * A vertical prism standing on a polygon (X, Z) between y0 and y1. `sideKey` picks the material of
   * each side face (by the index of the polygon edge it stands on); the caps use `capKey`.
   */
  prism(poly: XZ[], y0: number, y1: number, sideKey: string | ((edge: number) => string), capKey: string | null = null, caps: { top?: boolean; bottom?: boolean } = {}) {
    if (y1 - y0 < 1e-4 || poly.length < 3) return;
    const area = signedArea(poly);
    const key = (i: number) => (typeof sideKey === 'string' ? sideKey : sideKey(i));
    let along = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i];
      const [x1, z1] = poly[(i + 1) % poly.length];
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 1e-6) continue;
      // outward normal of the edge in the XZ plane
      const ex = (x1 - x0) / length;
      const ez = (z1 - z0) / length;
      const out: V3 = area > 0 ? [ez, 0, -ex] : [-ez, 0, ex];
      const u0 = along;
      const u1 = along + length;
      along = u1;
      const uv = (p: V3): [number, number] => {
        const t = Math.hypot(p[0] - x0, p[2] - z0);
        return [u0 + t, p[1]];
      };
      const a: V3 = [x0, y0, z0];
      const b: V3 = [x1, y0, z1];
      const c: V3 = [x1, y1, z1];
      const d: V3 = [x0, y1, z0];
      this.triangle(key(i), a, b, c, uv, out);
      this.triangle(key(i), a, c, d, uv, out);
      void u1;
    }
    const capMaterial = capKey ?? key(0);
    if (caps.top !== false) this.cap(capMaterial, poly, [], y1, 1);
    if (caps.bottom !== false) this.cap(capMaterial, poly, [], y0, -1);
  }

  /** A horizontal polygon (with holes) at height y, facing up (dir 1) or down (dir -1). */
  cap(key: string, outer: XZ[], holes: XZ[][], y: number, dir: 1 | -1) {
    const contour = outer.map(([x, z]) => new Vector2(x, z));
    const holeVectors = holes.map((h) => h.map(([x, z]) => new Vector2(x, z)));
    const all = [...outer, ...holes.flat()];
    const triangles = ShapeUtils.triangulateShape(contour, holeVectors);
    const uv = (p: V3): [number, number] => [p[0], p[2]];
    for (const [i, j, k] of triangles) {
      const a = all[i];
      const b = all[j];
      const c = all[k];
      this.triangle(key, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], uv, [0, dir, 0]);
    }
  }

  /** A slab: polygon with holes between y0 and y1, with its edges. */
  slab(outer: XZ[], holes: XZ[][], y0: number, y1: number, topKey: string, bottomKey: string, edgeKey: string) {
    this.cap(topKey, outer, holes, y1, 1);
    this.cap(bottomKey, outer, holes, y0, -1);
    for (const ring of [outer, ...holes]) {
      this.prism(ring, y0, y1, edgeKey, null, { top: false, bottom: false });
    }
  }

  /** An axis-free box between two points along its length, `width` across and y0..y1 high. */
  beam(key: string, [ax, az]: XZ, [bx, bz]: XZ, width: number, y0: number, y1: number) {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) return;
    const nx = (-(bz - az) / length) * (width / 2);
    const nz = ((bx - ax) / length) * (width / 2);
    this.prism([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], y0, y1, key);
  }

  get empty(): boolean {
    return this.buckets.size === 0;
  }

  geometries(): Map<string, BufferGeometry> {
    const out = new Map<string, BufferGeometry>();
    for (const [key, bucket] of this.buckets) {
      if (bucket.positions.length === 0) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(bucket.uvs, 2));
      geometry.computeBoundingSphere();
      out.set(key, geometry);
    }
    return out;
  }
}

export function signedArea(poly: XZ[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** UV projection on the plane of a face: u along a→b, v along a→d (metres). */
function planarUV(a: V3, b: V3, d: V3, _toward: V3): (p: V3) => [number, number] {
  const ux = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const vy = new Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
  vy.addScaledVector(ux, -vy.dot(ux)).normalize();
  return (p) => {
    const dx = p[0] - a[0];
    const dy = p[1] - a[1];
    const dz = p[2] - a[2];
    return [dx * ux.x + dy * ux.y + dz * ux.z, dx * vy.x + dy * vy.y + dz * vy.z];
  };
}

/** A square post centred on a point. */
export function post(b: Builder, key: string, [x, z]: XZ, size: number, y0: number, y1: number) {
  const h = size / 2;
  b.prism([[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]], y0, y1, key);
}

// ---- 2D helpers -------------------------------------------------------------------------------

/** Points along an arc around a centre, from angle a0 to a1 (degrees, drawing convention). */
export function arcPoints([cx, cz]: XZ, r: number, a0: number, a1: number, maxStep = 1.5): XZ[] {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / maxStep));
  const points: XZ[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    points.push([cx + r * Math.sin(t), cz - r * Math.cos(t)]);
  }
  return points;
}

/**
 * Polygon of an annular sector between radii r0 < r1 and angles a0 < a1, plus a tag per edge
 * ('outer' arc, 'inner' arc, 'end' faces) so that faces can be given different materials.
 */
export function sector(c: XZ, r0: number, r1: number, a0: number, a1: number): { poly: XZ[]; tags: string[] } {
  const outer = arcPoints(c, r1, a0, a1);
  const inner = arcPoints(c, r0, a1, a0);
  const poly = [...outer, ...inner];
  const tags: string[] = [];
  for (let i = 0; i < poly.length; i++) {
    if (i < outer.length - 1) tags.push('outer');
    else if (i === outer.length - 1) tags.push('end');
    else if (i < poly.length - 1) tags.push('inner');
    else tags.push('end');
  }
  return { poly, tags };
}

/** Rectangle polygon of a straight wall from a to b, `thickness` wide, centred on the line. */
export function strip([ax, az]: XZ, [bx, bz]: XZ, thickness: number, offset = 0): XZ[] {
  const length = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / length;
  const nz = (bx - ax) / length;
  const h0 = offset - thickness / 2;
  const h1 = offset + thickness / 2;
  return [
    [ax + nx * h0, az + nz * h0],
    [bx + nx * h0, bz + nz * h0],
    [bx + nx * h1, bz + nz * h1],
    [ax + nx * h1, az + nz * h1],
  ];
}

export function lerp2([ax, az]: XZ, [bx, bz]: XZ, t: number): XZ {
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}
