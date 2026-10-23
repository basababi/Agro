// Glazing, frames, sills and door leaves for every opening left in the walls.

import { arcPoints, Builder, lerp2, post, type V3 } from './builder';
import { DEG, END, I, INNER_IN, INNER_OUT, O, OUTER_IN, OUTER_OUT, WALL, type ArcOpening, type LineOpening, type Partition, type XZ } from './plan';
import { STOREYS } from './walls';

export const OPEN = {
  glass: 'windowGlass',
  frame: 'windowFrame',
  sill: 'sill',
  door: 'doorLeaf',
  leafFrame: 'doorLeafFrame',
  doorFrame: 'doorFrame',
  doorGlass: 'windowGlass',
} as const;

const FRAME = 0.06;
const DOOR_LEAF = 0.045;
/** Doors are shown open, so the walker can always pass. */
const OPEN_ANGLE = 80;

/** Glass, frame, glazing bars and sills of a window in a curved wall. */
function arcWindow(b: Builder, c: XZ, r0: number, r1: number, o: ArcOpening, floor: number, outsideIsOuter: boolean) {
  const mid = (r0 + r1) / 2;
  const y0 = floor + o.sill;
  const y1 = floor + o.head;
  const glassLine = arcPoints(c, mid, o.from, o.to, 1);
  for (let i = 0; i < glassLine.length - 1; i++) {
    const [p, q] = [glassLine[i], glassLine[i + 1]];
    b.quad(OPEN.glass, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [p[0] - c[0], 0, p[1] - c[1]]);
  }
  // frame: sill and head along the arc, jambs and bars across it
  const depth = 0.1;
  for (let i = 0; i < glassLine.length - 1; i++) {
    const [p, q] = [glassLine[i], glassLine[i + 1]];
    b.beam(OPEN.frame, p, q, depth, y0, y0 + FRAME);
    b.beam(OPEN.frame, p, q, depth, y1 - FRAME, y1);
    if (o.head - o.sill > 2.4) b.beam(OPEN.frame, p, q, depth, floor + 2.35, floor + 2.35 + 0.05);
  }
  const bars = o.bars ?? 0;
  for (let k = 0; k <= bars + 1; k++) {
    const a = o.from + ((o.to - o.from) * k) / (bars + 1);
    const p = arcPoints(c, mid, a, a, 1)[0];
    const width = k === 0 || k === bars + 1 ? FRAME * 1.6 : FRAME;
    post(b, OPEN.frame, p, width, y0, y1);
  }
  // stone sill outside, timber board inside
  if (o.sill > 0) {
    const outsideR = outsideIsOuter ? r1 : r0;
    const insideR = outsideIsOuter ? r0 : r1;
    sillBand(b, OPEN.sill, c, outsideR, outsideIsOuter ? 0.06 : -0.06, mid, o.from, o.to, y0 - 0.04, y0);
    sillBand(b, 'woodLight', c, insideR, outsideIsOuter ? -0.04 : 0.04, mid, o.from, o.to, y0 - 0.03, y0 + 0.01);
  }
}

/** A thin band between radius rMid and rEdge(+overhang), along an arc. */
function sillBand(b: Builder, key: string, c: XZ, rEdge: number, overhang: number, rMid: number, a0: number, a1: number, y0: number, y1: number) {
  const ra = Math.min(rMid, rEdge + overhang);
  const rb = Math.max(rMid, rEdge + overhang);
  const outer = arcPoints(c, rb, a0, a1, 1.5);
  const inner = arcPoints(c, ra, a1, a0, 1.5);
  b.prism([...outer, ...inner], y0, y1, key);
}

/** The main entrance: frame, two glass leaves standing open, glass transom above. */
function entrance(b: Builder, o: ArcOpening, floor: number) {
  const mid = (INNER_OUT + INNER_IN) / 2;
  const doorTop = floor + 2.6;
  const y1 = floor + o.head;
  const left = arcPoints(I, mid, o.from, o.from, 1)[0];
  const right = arcPoints(I, mid, o.to, o.to, 1)[0];
  post(b, OPEN.frame, left, FRAME * 1.8, floor, y1);
  post(b, OPEN.frame, right, FRAME * 1.8, floor, y1);
  const line = arcPoints(I, mid, o.from, o.to, 1);
  for (let i = 0; i < line.length - 1; i++) {
    const [p, q] = [line[i], line[i + 1]];
    b.beam(OPEN.frame, p, q, 0.12, doorTop, doorTop + 0.08);
    b.beam(OPEN.frame, p, q, 0.12, y1 - FRAME, y1);
    b.quad(OPEN.glass, [p[0], doorTop + 0.08, p[1]], [q[0], doorTop + 0.08, q[1]], [q[0], y1 - FRAME, q[1]], [p[0], y1 - FRAME, p[1]], [p[0] - I[0], 0, p[1] - I[1]]);
  }
  // two leaves, hinged at the jambs, opened inwards (away from the courtyard)
  const width = Math.hypot(right[0] - left[0], right[1] - left[1]) / 2;
  for (const [hinge, other] of [
    [left, right],
    [right, left],
  ] as const) {
    const u: XZ = [(other[0] - hinge[0]) / (2 * width), (other[1] - hinge[1]) / (2 * width)];
    const inward: XZ = [hinge[0] - I[0], hinge[1] - I[1]];
    const il = Math.hypot(...inward);
    const v: XZ = [inward[0] / il, inward[1] / il];
    const t = OPEN_ANGLE * DEG;
    const dir: XZ = [u[0] * Math.cos(t) + v[0] * Math.sin(t), u[1] * Math.cos(t) + v[1] * Math.sin(t)];
    const end: XZ = [hinge[0] + dir[0] * width, hinge[1] + dir[1] * width];
    glassLeaf(b, hinge, end, floor, doorTop);
  }
}

/** A framed glass door leaf from hinge to tip. */
function glassLeaf(b: Builder, hinge: XZ, tip: XZ, y0: number, y1: number) {
  const n: V3 = [-(tip[1] - hinge[1]), 0, tip[0] - hinge[0]];
  b.quad(OPEN.doorGlass, [hinge[0], y0 + 0.1, hinge[1]], [tip[0], y0 + 0.1, tip[1]], [tip[0], y1 - 0.08, tip[1]], [hinge[0], y1 - 0.08, hinge[1]], n);
  b.beam(OPEN.leafFrame, hinge, tip, DOOR_LEAF, y0, y0 + 0.1);
  b.beam(OPEN.leafFrame, hinge, tip, DOOR_LEAF, y1 - 0.08, y1);
  post(b, OPEN.leafFrame, hinge, 0.05, y0, y1);
  post(b, OPEN.leafFrame, tip, 0.05, y0, y1);
}

/** Frame and open leaf of a door in a straight wall. */
function lineDoor(b: Builder, a: XZ, bEnd: XZ, thickness: number, offset: number, from: number, to: number, floor: number, head: number, hinge: 'start' | 'end', into: XZ | 1 | -1, double = false) {
  const length = Math.hypot(bEnd[0] - a[0], bEnd[1] - a[1]);
  const u: XZ = [(bEnd[0] - a[0]) / length, (bEnd[1] - a[1]) / length];
  const n: XZ = [-u[1], u[0]];
  const at = (s: number): XZ => [a[0] + u[0] * s + n[0] * offset, a[1] + u[1] * s + n[1] * offset];
  // which side the leaf opens to: given directly, or towards a point in the room
  const centre = at((from + to) / 2);
  const swing = typeof into === 'number' ? into : (into[0] - centre[0]) * n[0] + (into[1] - centre[1]) * n[1] >= 0 ? 1 : -1;
  const p0 = at(from);
  const p1 = at(to);
  // frame (architrave) around the opening, slightly proud of both wall faces
  const w = thickness + 0.04;
  b.beam(OPEN.doorFrame, lerp2(p0, p1, 0), lerp2(p0, p1, 0.04 / (to - from)), w, floor, floor + head);
  b.beam(OPEN.doorFrame, lerp2(p0, p1, 1 - 0.04 / (to - from)), p1, w, floor, floor + head);
  b.beam(OPEN.doorFrame, p0, p1, w, floor + head - 0.05, floor + head);
  const leafs = double ? [['start', (to - from) / 2] as const, ['end', (to - from) / 2] as const] : [[hinge, to - from - 0.08] as const];
  for (const [side, width] of leafs) {
    const h = side === 'start' ? at(from + 0.04) : at(to - 0.04);
    const closed: XZ = side === 'start' ? u : [-u[0], -u[1]];
    const out: XZ = [n[0] * swing, n[1] * swing];
    const t = OPEN_ANGLE * DEG;
    const dir: XZ = [closed[0] * Math.cos(t) + out[0] * Math.sin(t), closed[1] * Math.cos(t) + out[1] * Math.sin(t)];
    const hingeAtFace: XZ = [h[0] + out[0] * (thickness / 2), h[1] + out[1] * (thickness / 2)];
    const tip: XZ = [hingeAtFace[0] + dir[0] * width, hingeAtFace[1] + dir[1] * width];
    b.beam(OPEN.door, hingeAtFace, tip, DOOR_LEAF, floor + 0.01, floor + head - 0.06);
    // handle
    const knob = lerp2(hingeAtFace, tip, 0.88);
    post(b, OPEN.leafFrame, knob, 0.07, floor + 1.0, floor + 1.03);
  }
}

/** Frame and open leaf of a door in a curved partition; the leaf opens towards `into`, else towards larger radii. */
function arcDoor(b: Builder, c: XZ, r0: number, r1: number, from: number, to: number, floor: number, into?: XZ) {
  const mid = (r0 + r1) / 2;
  const hinge = arcPoints(c, mid, from, from, 1)[0];
  const other = arcPoints(c, mid, to, to, 1)[0];
  lineDoor(b, hinge, other, r1 - r0, 0, 0, Math.hypot(other[0] - hinge[0], other[1] - hinge[1]), floor, 2.1, 'start', into ?? (isOutward(c, hinge, other) ? 1 : -1));
}

/** Whether the left normal of p→q points away from c. */
function isOutward(c: XZ, p: XZ, q: XZ): boolean {
  const n: XZ = [-(q[1] - p[1]), q[0] - p[0]];
  const m: XZ = [(p[0] + q[0]) / 2 - c[0], (p[1] + q[1]) / 2 - c[1]];
  return n[0] * m[0] + n[1] * m[1] > 0;
}

/** A window or door in the right end wall. */
function endOpening(b: Builder, o: LineOpening, floor: number) {
  const a = END.right.inner;
  const bEnd = END.right.outer;
  const ex = WALL.exterior;
  const length = Math.hypot(bEnd[0] - a[0], bEnd[1] - a[1]);
  const u: XZ = [(bEnd[0] - a[0]) / length, (bEnd[1] - a[1]) / length];
  const n: XZ = [-u[1], u[0]];
  const at = (s: number, off: number): XZ => [a[0] + u[0] * s + n[0] * off, a[1] + u[1] * s + n[1] * off];
  if (o.kind === 'door') {
    // leaf opens into the greenhouse (the +n side)
    lineDoor(b, a, bEnd, ex, -ex / 2, o.from, o.to, floor, o.head, o.hinge ?? 'end', 1);
    return;
  }
  const y0 = floor + o.sill;
  const y1 = floor + o.head;
  const p = at(o.from, -ex / 2);
  const q = at(o.to, -ex / 2);
  b.quad(OPEN.glass, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [n[0], 0, n[1]]);
  b.beam(OPEN.frame, p, q, 0.1, y0, y0 + FRAME);
  b.beam(OPEN.frame, p, q, 0.1, y1 - FRAME, y1);
  const bars = o.bars ?? 0;
  for (let k = 0; k <= bars + 1; k++) post(b, OPEN.frame, lerp2(p, q, k / (bars + 1)), FRAME, y0, y1);
}

export function buildOpenings(shell: Builder, interior: [Builder, Builder]) {
  STOREYS.forEach((storey, level) => {
    const floor = storey.floor;
    for (const o of storey.outerOpenings) arcWindow(shell, O, OUTER_IN, OUTER_OUT, o, floor, true);
    for (const o of storey.innerOpenings) {
      if (o.kind === 'entrance') entrance(shell, o, floor);
      else arcWindow(shell, I, INNER_OUT, INNER_IN, o, floor, false);
    }
    for (const o of storey.endOpenings) endOpening(shell, o, floor);

    const room = interior[level];
    for (const p of storey.partitions as Partition[]) {
      for (const d of p.doors ?? []) {
        lineDoor(room, p.a, p.b, p.thickness, 0, d.at - d.width / 2, d.at + d.width / 2, floor, d.double ? 2.4 : 2.1, d.hinge ?? 'start', d.into, d.double);
      }
    }
    for (const arc of storey.arcPartitions) {
      for (const d of arc.doors ?? []) arcDoor(room, arc.centre ?? O, arc.r0, arc.r1, d.from, d.to, floor, d.into);
    }
  });
}
