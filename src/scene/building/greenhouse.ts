// Room 9: the glass greenhouse leaning against the right end wall, entered from the dining room.

import { Builder, lerp2, post, type V3 } from './builder';
import { END, GREENHOUSE, LEVEL, type XZ } from './plan';

export const GH = {
  frame: 'ghFrame',
  glass: 'ghGlass',
  floor: 'ghFloor',
  plinth: 'plinth',
  bench: 'wood',
  soil: 'soil',
  plant: 'plant',
  light: 'growlight',
} as const;

/** Corners: along the end wall (a → b), then out into the garden (c, d). */
export function greenhouseCorners(): [XZ, XZ, XZ, XZ] {
  const a = END.right.inner;
  const b = END.right.outer;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // outward normal of the end wall (away from the ring)
  const n: XZ = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  const d = GREENHOUSE.depth;
  return [a, b, [b[0] + n[0] * d, b[1] + n[1] * d], [a[0] + n[0] * d, a[1] + n[1] * d]];
}

export function buildGreenhouse(b: Builder) {
  const [a, bb, c, d] = greenhouseCorners();
  const centre: XZ = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const f = LEVEL.f1;
  const plinthTop = f + GREENHOUSE.plinth;
  // roof height above a point, t = 0 at the end wall and 1 at the far side
  const roofAt = (t: number) => f + GREENHOUSE.high + (GREENHOUSE.low - GREENHOUSE.high) * t;
  const outward = (p: XZ, q: XZ): V3 => [(p[0] + q[0]) / 2 - centre[0], 0, (p[1] + q[1]) / 2 - centre[1]];

  // floor and foundation
  b.slab([a, bb, c, d], [], f - 0.3, f, GH.floor, GH.floor, GH.plinth);
  b.prism([a, bb, c, d], LEVEL.footing, f - 0.3, GH.plinth, GH.plinth);

  // the three garden sides: low wall, glass with mullions every ~1 m, rails
  const sides: [XZ, XZ, number, number][] = [
    [bb, c, 0, 1],
    [c, d, 1, 1],
    [d, a, 1, 0],
  ];
  for (const [p, q, tp, tq] of sides) {
    b.beam(GH.plinth, p, q, 0.25, f, plinthTop);
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const bays = Math.max(1, Math.round(length / 1.05));
    for (let i = 0; i < bays; i++) {
      const p0 = lerp2(p, q, i / bays);
      const p1 = lerp2(p, q, (i + 1) / bays);
      const h0 = roofAt(tp + ((tq - tp) * i) / bays);
      const h1 = roofAt(tp + ((tq - tp) * (i + 1)) / bays);
      b.quad(GH.glass, [p0[0], plinthTop, p0[1]], [p1[0], plinthTop, p1[1]], [p1[0], h1, p1[1]], [p0[0], h0, p0[1]], outward(p, q));
    }
    for (let i = 0; i <= bays; i++) {
      const s = i / bays;
      post(b, GH.frame, lerp2(p, q, s), 0.07, plinthTop, roofAt(tp + (tq - tp) * s));
    }
    b.beam(GH.frame, p, q, 0.08, plinthTop, plinthTop + 0.06);
    b.beam(GH.frame, p, q, 0.06, f + 2.2, f + 2.25);
  }

  // lean-to glass roof on rafters
  const top = (p: XZ, t: number): V3 => [p[0], roofAt(t), p[1]];
  b.quad(GH.glass, top(a, 0), top(bb, 0), top(c, 1), top(d, 1), [0, 1, 0]);
  const rafters = 8;
  for (let i = 0; i <= rafters; i++) {
    const p = lerp2(a, bb, i / rafters);
    const q = lerp2(d, c, i / rafters);
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const y0 = roofAt(k / steps);
      const y1 = roofAt((k + 1) / steps);
      b.beam(GH.frame, lerp2(p, q, k / steps), lerp2(p, q, (k + 1) / steps), 0.06, Math.min(y0, y1) - 0.08, Math.max(y0, y1) - 0.02);
    }
  }
  b.beam(GH.frame, a, bb, 0.1, roofAt(0) - 0.12, roofAt(0) + 0.02);
  b.beam(GH.frame, d, c, 0.1, roofAt(1) - 0.12, roofAt(1) + 0.02);

  // three planting benches running out from the wall, with seedlings and grow lights above
  for (const s of [0.3, 0.56, 0.82]) {
    const p0 = lerp2(a, bb, s - 0.055);
    const p1 = lerp2(a, bb, s + 0.055);
    const q0 = lerp2(d, c, s - 0.055);
    const q1 = lerp2(d, c, s + 0.055);
    const near0 = lerp2(p0, q0, 0.14);
    const near1 = lerp2(p1, q1, 0.14);
    const far0 = lerp2(p0, q0, 0.88);
    const far1 = lerp2(p1, q1, 0.88);
    const bench: XZ[] = [near0, near1, far1, far0];
    b.prism(bench, f + 0.72, f + 0.8, GH.bench);
    b.prism(bench, f + 0.8, f + 0.86, GH.soil);
    for (const leg of [near0, near1, far0, far1]) post(b, GH.frame, lerp2(leg, centre, 0.01), 0.05, f, f + 0.72);
    for (let i = 1; i < 12; i++) {
      for (const w of [0.25, 0.5, 0.75]) {
        const q = lerp2(lerp2(near0, near1, w), lerp2(far0, far1, w), i / 12);
        const h = 0.18 + ((i * 7 + w * 13) % 5) * 0.03;
        cone(b, GH.plant, q, 0.06, f + 0.86, f + 0.86 + h);
      }
    }
    b.beam(GH.light, lerp2(near0, near1, 0.5), lerp2(far0, far1, 0.5), 0.12, f + 2.15, f + 2.2);
  }
}

/** A small six-sided cone (a seedling). */
function cone(b: Builder, key: string, [x, z]: XZ, radius: number, y0: number, y1: number) {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    const p0: V3 = [x + Math.cos(t0) * radius, y0, z + Math.sin(t0) * radius];
    const p1: V3 = [x + Math.cos(t1) * radius, y0, z + Math.sin(t1) * radius];
    const out: V3 = [Math.cos((t0 + t1) / 2), 0.4, Math.sin((t0 + t1) / 2)];
    b.triangle(key, p0, p1, [x, y1, z], () => [0, 0], out);
  }
}
