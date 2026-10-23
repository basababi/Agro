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

  // Three distinct zones: forest seedlings, vertical hydroponics, and medicinal/rare specimens.
  const zones = [
    // Offset the first beds from the doorway; the middle 1.2 m aisle stays continuous.
    { s: 0.35, kind: 'seedlings' },
    { s: 0.65, kind: 'hydroponics' },
    { s: 0.88, kind: 'specimens' },
  ] as const;
  for (const { s, kind } of zones) {
    const p0 = lerp2(a, bb, s - 0.055);
    const p1 = lerp2(a, bb, s + 0.055);
    const q0 = lerp2(d, c, s - 0.055);
    const q1 = lerp2(d, c, s + 0.055);
    // Two bed modules leave a 1.2 m cross aisle through the greenhouse.
    for (const [nearT, farT] of [[0.2, 0.41], [0.59, 0.86]] as const) {
      const near0 = lerp2(p0, q0, nearT);
      const near1 = lerp2(p1, q1, nearT);
      const far0 = lerp2(p0, q0, farT);
      const far1 = lerp2(p1, q1, farT);
      const bench: XZ[] = [near0, near1, far1, far0];
      b.prism(bench, f + 0.72, f + 0.8, GH.bench);
      b.prism(bench, f + 0.8, f + 0.86, GH.soil);
      for (const leg of [near0, near1, far0, far1]) post(b, GH.frame, lerp2(leg, centre, 0.01), 0.05, f, f + 0.72);
      const plantRows = kind === 'specimens' ? [0.3, 0.5, 0.7] : [0.25, 0.5, 0.75];
      for (let i = 1; i < 7; i++) {
        for (const w of plantRows) {
          const q = lerp2(lerp2(near0, near1, w), lerp2(far0, far1, w), i / 7);
          const h = kind === 'specimens' ? 0.12 + ((i * 7 + w * 13) % 4) * 0.02 : 0.18 + ((i * 7 + w * 13) % 5) * 0.03;
          cone(b, GH.plant, q, 0.06, f + 0.86, f + 0.86 + h);
        }
      }
      b.beam(GH.light, lerp2(near0, near1, 0.5), lerp2(far0, far1, 0.5), 0.12, f + 2.15, f + 2.2);

      if (kind === 'hydroponics') {
        // Two raised channels make the vertical-growing system visible from the courtyard.
        for (const h of [1.25, 1.72]) {
          for (const p of [near0, near1, far0, far1]) post(b, GH.frame, p, 0.035, f + 0.86, f + h);
          const a0 = lerp2(near0, near1, 0.12);
          const a1 = lerp2(near0, near1, 0.88);
          const e0 = lerp2(far0, far1, 0.12);
          const e1 = lerp2(far0, far1, 0.88);
          b.beam(GH.bench, a0, a1, 0.11, f + h, f + h + 0.055);
          b.beam(GH.bench, e0, e1, 0.11, f + h, f + h + 0.055);
          for (let i = 1; i < 5; i++) {
            const q0 = lerp2(a0, e0, i / 5);
            const q1 = lerp2(a1, e1, i / 5);
            cone(b, GH.plant, lerp2(q0, q1, 0.5), 0.045, f + h + 0.055, f + h + 0.2);
          }
        }
      } else {
        // Small specimen tags at the front of the nursery and botanical sample beds.
        for (const w of [0.18, 0.5, 0.82]) {
          const p = lerp2(near0, near1, w);
          post(b, GH.frame, p, 0.025, f + 0.86, f + 1.12);
          const tag: XZ = [p[0] + (centre[0] - p[0]) * 0.08, p[1] + (centre[1] - p[1]) * 0.08];
          b.beam(GH.bench, p, tag, 0.035, f + 1.02, f + 1.13);
        }
      }
    }
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
