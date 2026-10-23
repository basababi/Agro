// The building as drawn in the team's floor plans (ground floor rooms 1–9, first floor 10–16),
// measured from the drawings at 41.52 px per metre.
//
// Building frame: metres, X to the right of the drawing, Z = minus "up" in the drawing (so the
// convex, back side of the arc is towards -Z), Y up. Polar angles are measured from the drawing's
// "up" direction, clockwise positive: point(θ, r) = (r·sin θ, -r·cos θ) around a centre.
//
// Two centres: the outer wall is drawn around O, the inner (courtyard) wall around I, which lies
// 1.30 m further towards the courtyard. R14715 is the room face of the outer wall (from O),
// R7165 the courtyard face of the inner wall (from I).

export type XZ = [x: number, z: number];

export const O: XZ = [0, 0];
export const I: XZ = [0, 1.303];

/** Outer wall: room face and outside face, around O. */
export const OUTER_IN = 14.716;
export const OUTER_OUT = 15.209;
/** Inner wall: courtyard face and room face, around I. */
export const INNER_OUT = 7.165;
export const INNER_IN = 7.647;
/** Ends of the arcs: outer wall around O, inner wall around I. */
export const OUTER_END = 75.15;
export const INNER_END = 65.45;

/** Floor and roof levels (three.js Y, same as the old model and the terrain pad). */
export const LEVEL = {
  plaza: 1.072,
  f1: 1.272,
  f2: 5.172,
  /** Underside of the roof slab. */
  roof: 8.372,
  slab: 0.3,
  roofSlab: 0.4,
  /** Bottom of the stone plinth, which shows where the hillside drops below the floor. */
  footing: -1.0,
};

export const WALL = { exterior: 0.493, partition: 0.24, light: 0.12 };

export const DEG = Math.PI / 180;

export function polar([cx, cz]: XZ, thetaDeg: number, r: number): XZ {
  const t = thetaDeg * DEG;
  return [cx + r * Math.sin(t), cz - r * Math.cos(t)];
}

/** Angle (degrees, as above) and radius of a point around a centre. */
export function toPolar([cx, cz]: XZ, [x, z]: XZ): { theta: number; r: number } {
  const dx = x - cx;
  const dz = z - cz;
  return { theta: Math.atan2(dx, -dz) / DEG, r: Math.hypot(dx, dz) };
}

// ---- End walls -------------------------------------------------------------------------------
// Straight walls from the end of the inner arc to the end of the outer arc (their outside faces);
// the wall thickness lies towards the inside of the ring.
export const END = {
  right: { inner: polar(I, INNER_END, INNER_OUT), outer: polar(O, OUTER_END, OUTER_OUT) },
  left: { inner: polar(I, -INNER_END, INNER_OUT), outer: polar(O, -OUTER_END, OUTER_OUT) },
};

// ---- Openings ---------------------------------------------------------------------------------

export type OpeningKind = 'window' | 'door' | 'entrance';

/** An opening in an arc wall, between two polar angles. Heights are above the floor. */
export interface ArcOpening {
  from: number;
  to: number;
  kind: OpeningKind;
  sill: number;
  head: number;
  /** Vertical glazing bars. */
  bars?: number;
}

/** An opening in a straight wall, between two distances measured along the wall from its start. */
export interface LineOpening {
  from: number;
  to: number;
  kind: OpeningKind;
  sill: number;
  head: number;
  bars?: number;
  /** Door leaf hinge side seen from the wall start, and the side it opens to. */
  hinge?: 'start' | 'end';
  swing?: 1 | -1;
}

const glazing = (from: number, to: number, sill = 0.9, head = 3.0, bars = 2): ArcOpening => ({ from, to, kind: 'window', sill, head, bars });

export const OUTER_WINDOWS: ArcOpening[] = [
  glazing(-70.3, -61.75),
  glazing(-54.05, -45.3),
  glazing(-37.8, -28.05),
  glazing(-23.5, -13.9),
  glazing(50.15, 58.45),
  glazing(61.75, 70.3),
];

/** Ground floor, inner (courtyard) wall: lobby glazing either side of the double entrance door. */
export const INNER_OPENINGS_F1: ArcOpening[] = [
  glazing(-60.2, -50.0),
  glazing(-32.5, -8.25, 0.3, 3.0, 4),
  { from: -6.75, to: 6.85, kind: 'entrance', sill: 0, head: 3.0 },
  glazing(8.45, 32.6, 0.3, 3.0, 4),
  glazing(50.0, 60.25),
];

export const INNER_OPENINGS_F2: ArcOpening[] = [
  glazing(-60.25, -49.85, 0.9, 2.7),
  glazing(-32.45, -20.7, 0.9, 2.7),
  glazing(-6.0, 5.7, 0.9, 2.7),
  glazing(20.8, 32.6, 0.9, 2.7),
  glazing(50.05, 60.3, 0.9, 2.7),
];

/** First-floor outer windows have the same positions, a lower head. */
export const OUTER_WINDOWS_F2: ArcOpening[] = OUTER_WINDOWS.map((w) => ({ ...w, head: 2.7 }));

/**
 * Right end wall (between the dining room 8 and the greenhouse 9), measured along the wall from
 * its inner end: the 1200 door to the greenhouse and the 2700 window.
 */
export const RIGHT_END_OPENINGS_F1: LineOpening[] = [
  { from: 3.25, to: 4.45, kind: 'door', sill: 0, head: 2.1, hinge: 'end', swing: 1 },
  { from: 4.9, to: 7.6, kind: 'window', sill: 0.9, head: 3.0, bars: 2 },
];
export const RIGHT_END_OPENINGS_F2: LineOpening[] = [{ from: 2.11, to: 5.07, kind: 'window', sill: 0.9, head: 2.7, bars: 2 }];

// ---- Partitions ---------------------------------------------------------------------------------

/** A straight interior wall between two points, with door gaps measured along it from `a`. */
export interface Partition {
  a: XZ;
  b: XZ;
  thickness: number;
  /** Door gaps along the wall; each leaf opens into the room containing `into`. */
  doors?: { at: number; width: number; double?: boolean; hinge?: 'start' | 'end'; into: XZ }[];
  /** Only the lower part (a glazed screen or a low wall). */
  height?: number;
}

/** A radial wall at angle θ around O, from the inner wall's room face out to the outer wall. */
function radial(theta: number, thickness: number, doors: Partition['doors'] = [], from?: number, to = OUTER_IN): Partition {
  const start = from ?? innerFaceRadiusAt(theta);
  return { a: polar(O, theta, start), b: polar(O, theta, to), thickness, doors: doors.map((d) => ({ ...d, at: d.at - start })) };
}

/** Distance from O to the inner wall's room face along the ray at θ. */
export function innerFaceRadiusAt(theta: number): number {
  // |O + r·u − I| = INNER_IN, u = (sin θ, -cos θ)
  const ux = Math.sin(theta * DEG);
  const uz = -Math.cos(theta * DEG);
  const dx = O[0] - I[0];
  const dz = O[1] - I[1];
  const b = 2 * (ux * dx + uz * dz);
  const c = dx * dx + dz * dz - INNER_IN * INNER_IN;
  return (-b + Math.sqrt(b * b - 4 * c)) / 2;
}

/** Distance from O along the ray at θ to the circle of radius r around c. */
export function rayToCircle(theta: number, [cx, cz]: XZ, r: number): number {
  const ux = Math.sin(theta * DEG);
  const uz = -Math.cos(theta * DEG);
  const dx = O[0] - cx;
  const dz = O[1] - cz;
  const b = 2 * (ux * dx + uz * dz);
  const c = dx * dx + dz * dz - r * r;
  return (-b + Math.sqrt(b * b - 4 * c)) / 2;
}

/** Point where the circle (c, r) crosses the line a→b shifted `offset` to its left, between a and b. */
export function circleLine(c: XZ, r: number, a: XZ, b: XZ, offset: number): XZ {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: XZ = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const p: XZ = [a[0] - u[1] * offset, a[1] + u[0] * offset];
  // |p + t·u − c| = r
  const dx = p[0] - c[0];
  const dz = p[1] - c[1];
  const half = u[0] * dx + u[1] * dz;
  const disc = Math.sqrt(half * half - (dx * dx + dz * dz - r * r));
  const t = [-half - disc, -half + disc].find((t) => t >= 0 && t <= l) ?? -half + disc;
  return [p[0] + u[0] * t, p[1] + u[1] * t];
}

/** A straight wall through two polar points around O, extended or cut to the given angles. */
function chord(t0: number, r0: number, t1: number, r1: number, thickness: number, doors: Partition['doors'] = []): Partition {
  return { a: polar(O, t0, r0), b: polar(O, t1, r1), thickness, doors };
}

/** Distance along a partition from `a` to the point where it crosses the ray at θ around O. */
export function alongAt(p: Partition, theta: number): number {
  const ux = Math.sin(theta * DEG);
  const uz = -Math.cos(theta * DEG);
  const dx = p.b[0] - p.a[0];
  const dz = p.b[1] - p.a[1];
  // a + s·(b−a) = O + r·u  →  solve for s
  const det = dx * -uz - dz * -ux;
  const s = ((O[0] - p.a[0]) * -uz - (O[1] - p.a[1]) * -ux) / det;
  return s * Math.hypot(dx, dz);
}

const P = WALL.partition;

export const PARTITIONS_F1: Partition[] = [
  // lobby | rooms 7, 6 and room 3 | room 4; door from the lobby into the hall 6
  radial(-41.8, P, [{ at: 9.88, width: 1.1, hinge: 'end', into: polar(O, -35, 9.9) }]),
  // room 5 | room 4
  radial(-57.25, P, [], 11.3),
  // room 3 | lobby: radial wall and the curved wall with the door at its left end (built as an arc)
  radial(-9.5, 0.29, [], 10.43),
  // toilets 2: left wall, right wall, divider
  radial(14.25, 0.22, [], 12.78),
  chord(29.4, 12.78, 32.6, OUTER_IN, P),
  radial(22.45, 0.2, [], 12.9),
  // stair / lobby | dining room 8, doorway beyond the stair flight
  // The threshold clears both the stair end and the outer-wall corner.
  radial(44.9, P, [{ at: 13.1, width: 1.4, hinge: 'start', into: polar(O, 50, 13.1) }]),
];

/**
 * Curved interior walls: radius band and angle range around `centre` (O unless given), with door
 * gaps (angle ranges). A door leaf opens towards `into`, or else towards larger radii.
 */
export interface ArcPartition {
  centre?: XZ;
  r0: number;
  r1: number;
  from: number;
  to: number;
  doors?: { from: number; to: number; into?: XZ }[];
  height?: number;
}

/**
 * A curved wall around I in the left wing, from inside the left end wall to the radial wall at
 * `toTheta` (around O). `radius` is its centre line; doors are placed by the angle around O of
 * their middle.
 */
function hallArc(radius: number, thickness: number, toTheta: number, doors: { at: number; width: number; into: XZ }[] = []): ArcPartition {
  const angleAt = (theta: number) => toPolar(I, polar(O, theta, rayToCircle(theta, I, radius))).theta;
  const end = circleLine(I, radius, END.left.inner, END.left.outer, WALL.exterior / 2);
  const half = (width: number) => width / 2 / radius / DEG;
  return {
    centre: I,
    r0: radius - thickness / 2,
    r1: radius + thickness / 2,
    from: toPolar(I, end).theta,
    to: angleAt(toTheta),
    doors: doors.map((d) => ({ from: angleAt(d.at) - half(d.width), to: angleAt(d.at) + half(d.width), into: d.into })),
  };
}

// Left wing: the hall 6 between room 7 and rooms 4, 5 is bounded by two arcs drawn around I
// (measured: centre lines at 10.11 m and 12.04 m from I). The outer one also divides 15 | 16 upstairs.
const HALL_INNER_RADIUS = 10.11;
const HALL_OUTER_RADIUS = 12.04;

export const ARC_PARTITIONS_F1: ArcPartition[] = [
  // room 3 | lobby, door at the left end
  { r0: 10.43, r1: 10.67, from: -41.2, to: -9.5, doors: [{ from: -40.6, to: -32.5 }] },
  // toilets 2 front wall with two doors
  { r0: 12.77, r1: 12.89, from: 14.25, to: 29.6, doors: [{ from: 15.2, to: 18.4 }, { from: 26.2, to: 29.4 }] },
  // room 7 | hall 6
  hallArc(HALL_INNER_RADIUS, 0.23, -41.8, [{ at: -53, width: 1.1, into: polar(O, -53, 8.6) }]),
  // hall 6 | rooms 5 and 4
  hallArc(HALL_OUTER_RADIUS, P, -41.8, [
    { at: -60.15, width: 1.1, into: polar(O, -62, 12.5) },
    { at: -54.0, width: 1.1, into: polar(O, -52, 12.5) },
  ]),
];

export const PARTITIONS_F2: Partition[] = [
  // room 14 | rooms 15, 16, doors to both
  radial(-57.1, P, [
    // Keep the first opening clear of the inner curved wall at the partition's start.
    { at: 8.3, width: 1.2, hinge: 'start', into: polar(O, -62, 9.2) },
    { at: 11.97, width: 1.2, hinge: 'end', into: polar(O, -62, 13) },
  ]),
  // laboratory 12 | room 14
  radial(-41.85, P, [{ at: 9.89, width: 1.2, hinge: 'start', into: polar(O, -50, 10) }]),
  // laboratory 12 | stair hall 10: 1800 double door
  radial(14.25, 0.25, [{ at: 9.21, width: 1.8, double: true, into: polar(O, 5, 9.2) }]),
  // toilets 13
  chord(29.4, 12.78, 32.6, OUTER_IN, P),
  radial(22.45, 0.2, [], 12.9),
  // stair hall 10 | room 11
  // Set the lab-11 doorway inward from its perimeter worktop for a clear landing approach.
  radial(44.9, P, [{ at: 12.4, width: 1.4, hinge: 'start', into: polar(O, 50, 12.4) }]),
];

export const ARC_PARTITIONS_F2: ArcPartition[] = [
  { r0: 12.77, r1: 12.89, from: 14.25, to: 29.6, doors: [{ from: 15.2, to: 18.4 }, { from: 26.2, to: 29.4 }] },
  // room 15 | room 16
  hallArc(HALL_OUTER_RADIUS, P, -57.1),
];

// ---- Stair ------------------------------------------------------------------------------------
// One straight flight along the lobby side of the wall at θ 44.9°, rising away from the courtyard
// to a landing at the outer wall. The drawing has it 3.6 m long (45°); it is lengthened to 4.6 m
// so that it can be climbed like a real stair (38°).
export const STAIR = {
  theta: 44.9,
  /** Keep a 1.2 m clear passage between the stair flight and its partition wall. */
  offset: P / 2 + 1.2,
  width: 1.5,
  start: 8.5,
  end: 13.1,
  risers: 18,
  /** First-floor slab opening above the flight, from this distance from O to the top. */
  openingFrom: 9.9,
};

// ---- Greenhouse (room 9) ------------------------------------------------------------------------
// Attached to the outside of the right end wall: 8.5 m along the wall, 7.0 m out from it.
export const GREENHOUSE = {
  depth: 7.0,
  /** Height of the glass at the end wall and at the far side (lean-to roof). */
  high: 3.6,
  low: 2.7,
  plinth: 0.45,
};

// ---- Placement on the site --------------------------------------------------------------------
// O sits at site-local (0.75, 0.0) and the building is turned 18° so that the greenhouse and both
// ends stay clear of the nursery, the tree trail, the swales, the rain tank and the boundary trees,
// and the entrance faces the end of the main path from the gate.
export const PLACEMENT = { lx: 0.75, ly: 0.0, rotation: 18 };
