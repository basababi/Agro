// Car park below the main gate. It is not part of the Blender model: it is built here, in the
// site-local frame (lx along the contour, ly downhill), and added under SITE_FRAME.
//
//   site boundary (ly 18.75) ── gate ──────────────────────────────
//                                │ footpath
//        ┌── 6 bays ──┐          │          ┌── 4 bays ──┐     cut into the slope,
//        └────────────┘          │          └────────────┘     stone retaining walls
//   ═══════════════ access road along the contour ═══════════════  (ly 31.5 … 37.5)
//                        grass embankment, downhill
//
// The road lies at the height the hillside has at its uphill edge, so only the bays are cut.

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SLOPE } from './coords';

const ROAD_NEAR = 31.5;
const ROAD_FAR = 37.5;
/** Where the embankment below the road meets the hillside again. */
const BANK_TOE = 42;
/** The road runs on into the fog in both directions. */
const ROAD_HALF_LENGTH = 320;

const BAY_BACK = 26.25;
const BAY_WIDTH = 2.5;
/** Two groups of bays, left and right of the footpath: `from` is the lx of the first bay. */
const BAY_GROUPS = [
  { from: -13.5, bays: 6, cars: [0, 2, 3, 5] },
  { from: 9.5, bays: 4, cars: [1, 2] },
];

const PATH_X = 5.5;
const PATH_WIDTH = 1.8;
/** Just outside the gate, where the model's own main path ends. */
const PATH_TOP = 18.8;

const WALL = 0.3;
/** The retaining walls stand this much above the ground behind them. */
const PARAPET = 0.35;

/** Height of the whole terrace: the hillside at the uphill edge of the road. */
const LEVEL = -SLOPE * ROAD_NEAR;
const hillside = (ly: number) => -SLOPE * ly;

/**
 * Top of the road and of the embankment below it, which lie above the terrain mesh.
 * Returns -Infinity away from them.
 */
export function roadSurface(ly: number): number {
  if (ly < ROAD_NEAR || ly > BANK_TOE) return -Infinity;
  if (ly <= ROAD_FAR) return LEVEL + 0.04;
  const down = (ly - ROAD_FAR) / (BANK_TOE - ROAD_FAR);
  return LEVEL + 0.04 + (hillside(BANK_TOE) - LEVEL - 0.04) * down;
}

const CAR_COLOURS = ['#e9e7e1', '#3a4046', '#27507a', '#8f2d27', '#b9bdc1', '#4d6b3c'];

type Point = [lx: number, y: number, ly: number];

/** Collects flat faces given in site-local coordinates and turns them into one geometry. */
class Faces {
  private positions: number[] = [];
  private normals: number[] = [];

  /** A four-cornered face; `toward` says which way it looks, so the winding cannot be wrong. */
  quad(a: Point, b: Point, c: Point, d: Point, toward: [number, number, number] = [0, 1, 0]) {
    const [pa, pb, pc, pd] = [a, b, c, d].map(([lx, y, ly]) => new Vector3(lx, y, -ly));
    const normal = new Vector3().subVectors(pb, pa).cross(new Vector3().subVectors(pc, pa)).normalize();
    const facing = normal.dot(new Vector3(toward[0], toward[1], -toward[2])) >= 0;
    if (!facing) normal.negate();
    const corners = facing ? [pa, pb, pc, pa, pc, pd] : [pa, pc, pb, pa, pd, pc];
    for (const corner of corners) {
      this.positions.push(corner.x, corner.y, corner.z);
      this.normals.push(normal.x, normal.y, normal.z);
    }
  }

  /** A horizontal rectangle at height y (or at y(ly) when it slopes with the hillside). */
  floor(x0: number, x1: number, y0: number, y1: number, y: number | ((ly: number) => number)) {
    const at = typeof y === 'number' ? () => y : y;
    this.quad([x0, at(y0), y0], [x1, at(y0), y0], [x1, at(y1), y1], [x0, at(y1), y1]);
  }

  /** A block standing on `bottom` whose top follows top(ly): a wall, also on sloping ground. */
  block(x0: number, x1: number, y0: number, y1: number, bottom: number, top: (ly: number) => number) {
    this.floor(x0, x1, y0, y1, top);
    this.quad([x0, bottom, y0], [x1, bottom, y0], [x1, top(y0), y0], [x0, top(y0), y0], [0, 0, -1]);
    this.quad([x0, bottom, y1], [x1, bottom, y1], [x1, top(y1), y1], [x0, top(y1), y1], [0, 0, 1]);
    this.quad([x0, bottom, y0], [x0, bottom, y1], [x0, top(y1), y1], [x0, top(y0), y0], [-1, 0, 0]);
    this.quad([x1, bottom, y0], [x1, bottom, y1], [x1, top(y1), y1], [x1, top(y0), y0], [1, 0, 0]);
  }

  get arrays() {
    return { positions: this.positions, normals: this.normals };
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    return geometry;
  }
}

/** The grid lines of the terrain mesh, which are not evenly spaced. */
function gridLines(terrain: Mesh): { lx: number[]; ly: number[] } {
  const position = terrain.geometry.getAttribute('position');
  const lx = new Set<number>();
  const ly = new Set<number>();
  for (let i = 0; i < position.count; i++) {
    lx.add(Math.round(position.getX(i) * 1000) / 1000);
    ly.add(Math.round(-position.getZ(i) * 1000) / 1000);
  }
  const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b);
  return { lx: sorted(lx), ly: sorted(ly) };
}

/**
 * Replaces the block of terrain around the bays by new ground: the hillside as it was, with
 * the bays cut down to the level of the road. The terrain keeps being one mesh, so the ground
 * sampler and the walk collider need no special cases.
 */
function cutBaysIntoTerrain(terrain: Mesh) {
  const lines = gridLines(terrain);
  const firstBay = BAY_GROUPS[0].from;
  const lastGroup = BAY_GROUPS[BAY_GROUPS.length - 1];
  const lastBay = lastGroup.from + lastGroup.bays * BAY_WIDTH;
  // The block must end on grid lines of the terrain, or it would leave slivers.
  const x0 = Math.max(...lines.lx.filter((v) => v <= firstBay - WALL - 0.1));
  const x1 = Math.min(...lines.lx.filter((v) => v >= lastBay + WALL + 0.1));
  const y0 = Math.max(...lines.ly.filter((v) => v <= BAY_BACK - WALL - 0.1));
  const y1 = Math.min(...lines.ly.filter((v) => v >= ROAD_NEAR));

  const old = terrain.geometry;
  const position = old.getAttribute('position');
  const normal = old.getAttribute('normal');
  const index = old.index;
  if (!index) return;

  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const lx = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const ly = -(position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    if (lx > x0 && lx < x1 && ly > y0 && ly < y1) continue;
    kept.push(a, b, c);
  }

  const ground = new Faces();
  const columns = [x0, ...BAY_GROUPS.flatMap((g) => [g.from, g.from + g.bays * BAY_WIDTH]), x1];
  const rows = [y0, BAY_BACK, ROAD_NEAR, y1];
  for (let i = 0; i < columns.length - 1; i++) {
    for (let j = 0; j < rows.length - 1; j++) {
      const inBayGroup = i % 2 === 1;
      const level = j === 2 || (j === 1 && inBayGroup);
      ground.floor(columns[i], columns[i + 1], rows[j], rows[j + 1], level ? LEVEL : hillside);
    }
  }
  // A lip under the old terrain around the block hides hairline cracks along the seam.
  const below = (ly: number) => hillside(ly) - 0.02;
  ground.floor(x0 - 0.4, x1 + 0.4, y0 - 0.4, y0, below);
  ground.floor(x0 - 0.4, x0, y0, ROAD_NEAR, below);
  ground.floor(x1, x1 + 0.4, y0, ROAD_NEAR, below);

  const added = ground.arrays;
  const positions = new Float32Array(position.count * 3 + added.positions.length);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < position.count; i++) {
    positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
    normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], i * 3);
  }
  positions.set(added.positions, position.count * 3);
  normals.set(added.normals, position.count * 3);
  for (let i = 0; i < added.positions.length / 3; i++) kept.push(position.count + i);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(kept);
  terrain.geometry = geometry;
  old.dispose();
}

function asphalt(): BufferGeometry {
  const faces = new Faces();
  faces.floor(-ROAD_HALF_LENGTH, ROAD_HALF_LENGTH, ROAD_NEAR, ROAD_FAR, LEVEL + 0.04);
  for (const group of BAY_GROUPS) {
    faces.floor(group.from, group.from + group.bays * BAY_WIDTH, BAY_BACK, ROAD_NEAR, LEVEL + 0.04);
  }
  return faces.geometry();
}

function embankment(): BufferGeometry {
  const faces = new Faces();
  faces.quad(
    [-ROAD_HALF_LENGTH, LEVEL + 0.04, ROAD_FAR],
    [ROAD_HALF_LENGTH, LEVEL + 0.04, ROAD_FAR],
    [ROAD_HALF_LENGTH, hillside(BANK_TOE) - 0.15, BANK_TOE + 0.4],
    [-ROAD_HALF_LENGTH, hillside(BANK_TOE) - 0.15, BANK_TOE + 0.4],
  );
  return faces.geometry();
}

function retainingWalls(): BufferGeometry {
  const faces = new Faces();
  const bottom = LEVEL - 0.2;
  const top = (ly: number) => hillside(ly) + PARAPET;
  for (const group of BAY_GROUPS) {
    const from = group.from;
    const to = group.from + group.bays * BAY_WIDTH;
    const backTop = top(BAY_BACK - WALL);
    faces.block(from - WALL, to + WALL, BAY_BACK - WALL, BAY_BACK, bottom, () => backTop);
    faces.block(from - WALL, from, BAY_BACK, ROAD_NEAR, bottom, top);
    faces.block(to, to + WALL, BAY_BACK, ROAD_NEAR, bottom, top);
  }
  return faces.geometry();
}

function markings(): BufferGeometry {
  const faces = new Faces();
  const y = LEVEL + 0.055;
  for (const group of BAY_GROUPS) {
    for (let bay = 0; bay <= group.bays; bay++) {
      const x = group.from + bay * BAY_WIDTH;
      // The outermost lines sit just inside the walls.
      const centre = bay === 0 ? x + 0.06 : bay === group.bays ? x - 0.06 : x;
      faces.floor(centre - 0.05, centre + 0.05, BAY_BACK + 0.35, ROAD_NEAR, y);
    }
  }
  // Dashed centre line of the road, near the site only.
  const middle = (ROAD_NEAR + ROAD_FAR) / 2;
  for (let x = -63; x < 63; x += 9) faces.floor(x, x + 3, middle - 0.06, middle + 0.06, y);
  return faces.geometry();
}

function footpath(): BufferGeometry {
  const faces = new Faces();
  const half = PATH_WIDTH / 2;
  faces.floor(PATH_X - half, PATH_X + half, PATH_TOP, ROAD_NEAR, (ly) => hillside(ly) + 0.03);
  return faces.geometry();
}

/** Paints a whole geometry in one colour, for meshes drawn with vertex colours. */
function tinted(geometry: BufferGeometry, colour: string): BufferGeometry {
  const { r, g, b } = new Color(colour);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return geometry;
}

/** A low-poly car, 4.3 m long, standing on y = 0 with its nose towards +z. */
function car(colour: string): BufferGeometry[] {
  const parts = [
    tinted(new BoxGeometry(1.76, 0.6, 4.3).translate(0, 0.56, 0), colour),
    tinted(new BoxGeometry(1.56, 0.5, 2.3).translate(0, 1.11, -0.3), '#1d262d'),
    tinted(new BoxGeometry(1.6, 0.07, 2.1).translate(0, 1.39, -0.3), colour),
  ];
  for (const x of [-0.8, 0.8]) {
    for (const z of [-1.35, 1.35]) {
      const wheel = new CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(Math.PI / 2).translate(x, 0.33, z);
      parts.push(tinted(wheel, '#17181a'));
    }
  }
  return parts;
}

/** All parked cars as one geometry: nose to the wall, in some of the bays. */
function cars(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let n = 0;
  for (const group of BAY_GROUPS) {
    for (const bay of group.cars) {
      const lx = group.from + (bay + 0.5) * BAY_WIDTH;
      // Not perfectly lined up, as parked cars never are.
      const ly = BAY_BACK + 2.85 + (n % 3) * 0.12;
      for (const part of car(CAR_COLOURS[n % CAR_COLOURS.length])) parts.push(part.translate(lx, LEVEL + 0.04, -ly));
      n += 1;
    }
  }
  return mergeGeometries(parts);
}

function signTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#1f5cb8';
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 6;
    context.strokeRect(7, 7, 114, 114);
    context.fillStyle = '#ffffff';
    context.font = 'bold 96px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('P', 64, 70);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A "P" sign beside the footpath where it reaches the road, readable from both sides. */
function sign(post: Material): Object3D {
  const group = new Group();
  const lx = PATH_X + PATH_WIDTH / 2 + 0.6;
  const ly = ROAD_NEAR - 0.6;
  group.position.set(lx, hillside(ly), -ly);

  const pole = new Mesh(new CylinderGeometry(0.035, 0.035, 2.6, 8).translate(0, 1.3, 0), post);
  const face = new MeshStandardMaterial({ map: signTexture(), roughness: 0.6 });
  face.name = 'parking_sign';
  const front = new Mesh(new PlaneGeometry(0.6, 0.6).translate(0, 2.25, 0.04), face);
  const back = new Mesh(new PlaneGeometry(0.6, 0.6).rotateY(Math.PI).translate(0, 2.25, -0.04), face);
  for (const mesh of [pole, front, back]) mesh.userData.solid = false;
  group.add(pole, front, back);
  return group;
}

/** Adds the car park to the model. Safe to call again: it only acts once per scene. */
export function addParking(scene: Object3D, materials: Record<string, Material>) {
  const frame = scene.getObjectByName('SITE_FRAME');
  const terrain = frame?.getObjectByName('Terrain');
  if (!frame || !(terrain instanceof Mesh) || frame.getObjectByName('Parking')) return;

  cutBaysIntoTerrain(terrain);

  const tarmac = new MeshStandardMaterial({ color: '#40444a', roughness: 0.95 });
  tarmac.name = 'asphalt';
  const paint = new MeshStandardMaterial({ color: '#eceae4', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  paint.name = 'road_marking';
  const coachwork = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
  coachwork.name = 'car';

  const parking = new Group();
  parking.name = 'Parking';
  parking.userData.group = 'parking';

  const add = (name: string, geometry: BufferGeometry, material: Material, solid = true) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    if (!solid) mesh.userData.solid = false;
    parking.add(mesh);
  };
  add('PARK_asphalt', asphalt(), tarmac);
  add('PARK_embankment', embankment(), materials.grass);
  add('PARK_walls', retainingWalls(), materials.stone);
  add('PARK_cars', cars(), coachwork);
  add('PARK_markings', markings(), paint, false);
  add('PARK_path', footpath(), materials.path, false);
  parking.add(sign(materials.metal));

  frame.add(parking);
}
