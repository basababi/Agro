// Walls of both storeys: the curved outer and inner walls, the two end walls and the partitions,
// with their window and door openings (sills and lintels around each opening).

import { Builder, sector, strip, lerp2 } from './builder';
import {
  ARC_PARTITIONS_F1,
  ARC_PARTITIONS_F2,
  END,
  I,
  INNER_END,
  INNER_IN,
  INNER_OPENINGS_F1,
  INNER_OPENINGS_F2,
  INNER_OUT,
  LEVEL,
  O,
  OUTER_END,
  OUTER_IN,
  OUTER_OUT,
  OUTER_WINDOWS,
  OUTER_WINDOWS_F2,
  PARTITIONS_F1,
  PARTITIONS_F2,
  RIGHT_END_OPENINGS_F1,
  RIGHT_END_OPENINGS_F2,
  WALL,
  type ArcOpening,
  type ArcPartition,
  type LineOpening,
  type Partition,
  type XZ,
} from './plan';

/** Material keys used by the walls. */
export const M = {
  facade: 'facade',
  plaster: 'plaster',
  reveal: 'reveal',
  plinth: 'plinth',
  parapet: 'parapet',
  skirting: 'skirting',
} as const;

/** Skirting board along the foot of every room-side wall face. */
const SKIRTING = { height: 0.08, thickness: 0.012 };

export interface Storey {
  /** Floor level (top of slab). */
  floor: number;
  /** Top of the walls of this storey (underside of the slab above, or of the roof). */
  top: number;
  /** Height of the walls above the floor that carry the openings, i.e. to the ceiling. */
  outerOpenings: ArcOpening[];
  innerOpenings: ArcOpening[];
  endOpenings: LineOpening[];
  partitions: Partition[];
  arcPartitions: ArcPartition[];
}

export const STOREYS: Storey[] = [
  {
    floor: LEVEL.f1,
    top: LEVEL.f2,
    outerOpenings: OUTER_WINDOWS,
    innerOpenings: INNER_OPENINGS_F1,
    endOpenings: RIGHT_END_OPENINGS_F1,
    partitions: PARTITIONS_F1,
    arcPartitions: ARC_PARTITIONS_F1,
  },
  {
    floor: LEVEL.f2,
    top: LEVEL.roof + LEVEL.roofSlab,
    outerOpenings: OUTER_WINDOWS_F2,
    innerOpenings: INNER_OPENINGS_F2,
    endOpenings: RIGHT_END_OPENINGS_F2,
    partitions: PARTITIONS_F2,
    arcPartitions: ARC_PARTITIONS_F2,
  },
];

/** Interior ceiling height of each storey (the partitions stop there). */
export const CEILING = [LEVEL.f2 - LEVEL.slab, LEVEL.roof];

/**
 * Splits an angle range into solid wall pieces and openings. Each piece is [from, to, opening?].
 */
function pieces<T extends { from: number; to: number }>(from: number, to: number, openings: T[]): [number, number, T | null][] {
  const sorted = [...openings].sort((a, b) => a.from - b.from);
  const out: [number, number, T | null][] = [];
  let at = from;
  for (const o of sorted) {
    if (o.from > at) out.push([at, o.from, null]);
    out.push([Math.max(o.from, from), Math.min(o.to, to), o]);
    at = o.to;
  }
  if (at < to) out.push([at, to, null]);
  return out;
}

/**
 * A curved wall around `c` between radii r0 < r1, from a0 to a1, from `bottom` to `top`, with
 * openings. `outside` says which face is the facade: the 'outer' (larger radius) or the 'inner'.
 */
function arcWall(b: Builder, c: XZ, r0: number, r1: number, a0: number, a1: number, floor: number, top: number, openings: ArcOpening[], outside: 'outer' | 'inner' | 'none') {
  const keyFor = (tags: string[]) => (i: number) =>
    tags[i] === 'end' ? (outside === 'none' ? M.plaster : M.reveal) : tags[i] === outside ? M.facade : M.plaster;
  const add = (from: number, to: number, y0: number, y1: number) => {
    if (to - from < 1e-3) return;
    const { poly, tags } = sector(c, r0, r1, from, to);
    b.prism(poly, y0, y1, keyFor(tags), M.reveal);
    if (y0 !== floor) return;
    // skirting on the room side(s): the face at r0 unless that is the facade, and the face at r1
    const t = SKIRTING.thickness;
    if (outside !== 'inner') b.prism(sector(c, r0 - t, r0, from, to).poly, floor, floor + SKIRTING.height, M.skirting);
    if (outside !== 'outer') b.prism(sector(c, r1, r1 + t, from, to).poly, floor, floor + SKIRTING.height, M.skirting);
  };
  for (const [from, to, opening] of pieces(a0, a1, openings)) {
    if (!opening) {
      add(from, to, floor, top);
      continue;
    }
    if (opening.sill > 0) add(from, to, floor, floor + opening.sill);
    add(from, to, floor + opening.head, top);
  }
}

/** A straight wall from a to b (thickness to the left of a→b when `side` is 1), with openings. */
function lineWall(b: Builder, a: XZ, bEnd: XZ, thickness: number, floor: number, top: number, openings: LineOpening[], facadeSide: 1 | -1 | 0, offset = 0) {
  const length = Math.hypot(bEnd[0] - a[0], bEnd[1] - a[1]);
  const keyFor = (edge: number) => {
    // strip(): edge 0 runs a→b on the -offset side, edge 2 b→a on the +offset side, 1 and 3 are ends
    if (edge === 1 || edge === 3) return M.reveal;
    if (facadeSide === 0) return M.plaster;
    const onPlus = edge === 2;
    return (onPlus ? 1 : -1) === facadeSide ? M.facade : M.plaster;
  };
  const add = (s0: number, s1: number, y0: number, y1: number) => {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    const p0 = lerp2(a, bEnd, s0 / length);
    const p1 = lerp2(a, bEnd, s1 / length);
    b.prism(strip(p0, p1, thickness, offset), y0, y1, keyFor, M.reveal);
    if (y0 !== floor) return;
    const t = SKIRTING.thickness;
    for (const side of [-1, 1] as const) {
      if (side === facadeSide) continue;
      b.prism(strip(p0, p1, t, offset + side * (thickness / 2 + t / 2)), floor, floor + SKIRTING.height, M.skirting);
    }
  };
  for (const [s0, s1, opening] of pieces(0, length, openings)) {
    if (!opening) {
      add(s0, s1, floor, top);
      continue;
    }
    if (opening.sill > 0) add(s0, s1, floor, floor + opening.sill);
    add(s0, s1, floor + opening.head, top);
  }
}

/** Openings of a partition's doors, as LineOpenings along it. */
function doorOpenings(p: Partition): LineOpening[] {
  return (p.doors ?? []).map((d) => ({ from: d.at - d.width / 2, to: d.at + d.width / 2, kind: 'door', sill: 0, head: d.double ? 2.4 : 2.1 }));
}

/** Exterior walls (and their plinth and parapet) and the partitions of both storeys. */
export function buildWalls(shell: Builder, interior: [Builder, Builder]) {
  const ex = WALL.exterior;
  // Plinth under the ground floor and parapet above the roof, around the whole ring.
  const plinthTop = LEVEL.f1;
  const parapetTop = LEVEL.roof + LEVEL.roofSlab + 0.45;
  for (const [y0, y1, key] of [
    [LEVEL.footing, plinthTop, M.plinth],
    [STOREYS[1].top, parapetTop, M.parapet],
  ] as const) {
    const plinthKey = () => key;
    const outer = sector(O, OUTER_IN, OUTER_OUT, -OUTER_END, OUTER_END);
    shell.prism(outer.poly, y0, y1, plinthKey, key);
    // The plinth follows the wall, but must stop below the ground-floor entrance opening.
    const entranceGaps = STOREYS[0].innerOpenings.filter((opening) => opening.kind === 'entrance');
    for (const [from, to, opening] of pieces(-INNER_END, INNER_END, entranceGaps)) {
      if (opening) continue;
      const inner = sector(I, INNER_OUT, INNER_IN, from, to);
      shell.prism(inner.poly, y0, y1, plinthKey, key);
    }
    for (const end of [END.left, END.right]) {
      const side = end === END.left ? -1 : 1;
      const openings = end === END.right
        ? STOREYS[0].endOpenings.filter((opening) => opening.kind === 'door')
        : [];
      if (openings.length === 0) {
        shell.prism(strip(end.inner, end.outer, ex, (-side * ex) / 2), y0, y1, plinthKey, key);
        continue;
      }
      const length = Math.hypot(end.outer[0] - end.inner[0], end.outer[1] - end.inner[1]);
      const gaps = openings.map((opening) => ({ ...opening, sill: 0, head: y1 - y0 }));
      for (const [from, to, opening] of pieces(0, length, gaps)) {
        if (opening) continue;
        const p0 = lerp2(end.inner, end.outer, from / length);
        const p1 = lerp2(end.inner, end.outer, to / length);
        shell.prism(strip(p0, p1, ex, (-side * ex) / 2), y0, y1, plinthKey, key);
      }
    }
  }

  STOREYS.forEach((storey, level) => {
    const { floor, top } = storey;
    arcWall(shell, O, OUTER_IN, OUTER_OUT, -OUTER_END, OUTER_END, floor, top, storey.outerOpenings, 'outer');
    arcWall(shell, I, INNER_OUT, INNER_IN, -INNER_END, INNER_END, floor, top, storey.innerOpenings, 'inner');
    // End walls: the outside face lies on the line inner→outer, the thickness inside the ring,
    // which is on the left of that line at the left end and on its right at the right end.
    lineWall(shell, END.left.inner, END.left.outer, ex, floor, top, [], -1, ex / 2);
    lineWall(shell, END.right.inner, END.right.outer, ex, floor, top, storey.endOpenings, 1, -ex / 2);

    const room = interior[level];
    const ceiling = CEILING[level];
    for (const p of storey.partitions) {
      lineWall(room, p.a, p.b, p.thickness, floor, p.height ? floor + p.height : ceiling, doorOpenings(p), 0);
    }
    for (const arc of storey.arcPartitions) {
      const openings = (arc.doors ?? []).map((d) => ({ ...d, kind: 'door' as const, sill: 0, head: 2.1 }));
      arcWall(room, arc.centre ?? O, arc.r0, arc.r1, arc.from, arc.to, floor, arc.height ? floor + arc.height : ceiling, openings, 'none');
    }
  });
}

export { INNER_IN, INNER_OUT };
