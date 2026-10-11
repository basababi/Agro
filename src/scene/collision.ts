import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Ray,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

/** Never solid: glowing signs and screens, small plants, water (the pond can be waded). */
const PASSABLE_MATERIALS = new Set(['screen', 'growlight', 'text', 'plant', 'water']);
/** Flower colours; indoors the same colours are exhibit furniture. */
const FLOWER_MATERIALS = new Set(['pink', 'yellow', 'purple', 'orange']);
/**
 * The curtain-wall mullions stand 0.75 m apart, also across the door openings, where they
 * would leave a 0.6 m walker almost no room. Only the glass between them is solid.
 */
const PASSABLE_MESHES = new Set(['Bld_metal']);
/** Trees get a trunk cylinder; shrubs and crowns can be walked through. */
const TREE_NAME = /^(larch|pine|birch|poplar|elm)_/;
const TRUNK_RADIUS = 0.25;
const TRUNK_HEIGHT = 3;

// Indoors several exhibits stand right in the doorways between the zones, so solid furniture
// would lock the walker in the lobby. Pieces that end below eye level (tables, benches,
// display stands) therefore do not stop the walker; walls, partitions, glass cases and
// anything taller do. Low plinths and floor slabs stay solid, they are walked on.
const FLOOR_LEVEL: Record<string, number> = { floor1: 1.272, floor2: 5.172, greenhouse: 1.272 };
const FURNITURE_MIN_TOP = 0.3;
const FURNITURE_MAX_TOP = 1.45;

// The stair (CLAUDE.md §4): 20 steps of 0.195 × 0.28 m, 0.9 m wide, from the ground floor to the
// first floor. An invisible ramp resting on the step nosings lets the walker glide up and down
// instead of bumping over every step. It starts one step before the first riser.
const STAIR_BOTTOM = [3.52, 1.272, 0.56];
const STAIR_TOP = [6.81, 5.172, 5.09];
const STAIR_WIDTH = 0.9;
const STAIR_RUN = 0.28;

function stairRamp(): Float32Array {
  const run = Math.hypot(STAIR_TOP[0] - STAIR_BOTTOM[0], STAIR_TOP[2] - STAIR_BOTTOM[2]);
  const dirX = (STAIR_TOP[0] - STAIR_BOTTOM[0]) / run;
  const dirZ = (STAIR_TOP[2] - STAIR_BOTTOM[2]) / run;
  const sideX = (-dirZ * STAIR_WIDTH) / 2;
  const sideZ = (dirX * STAIR_WIDTH) / 2;
  // The nosings lie one step behind the line through the foot of the risers.
  const corner = (along: number, y: number, side: number) => [
    STAIR_BOTTOM[0] + dirX * (along - STAIR_RUN) + sideX * side,
    y,
    STAIR_BOTTOM[2] + dirZ * (along - STAIR_RUN) + sideZ * side,
  ];
  const a = corner(0, STAIR_BOTTOM[1], -1);
  const b = corner(0, STAIR_BOTTOM[1], 1);
  const c = corner(run, STAIR_TOP[1], 1);
  const d = corner(run, STAIR_TOP[1], -1);
  return new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
}

function isSolid(mesh: Mesh): boolean {
  const material = (mesh.material as Material).name;
  // Thin overlays such as road markings, which lie on something solid anyway.
  if (mesh.userData.solid === false) return false;
  if (PASSABLE_MESHES.has(mesh.name)) return false;
  if (PASSABLE_MATERIALS.has(material)) return false;
  if (mesh.userData.group === 'outdoor' && FLOWER_MATERIALS.has(material)) return false;
  return true;
}

/** World-space triangle positions of a geometry (three vertices per triangle). */
function bake(source: BufferGeometry, matrix: Matrix4): Float32Array {
  const part = new BufferGeometry();
  part.setAttribute('position', source.getAttribute('position').clone());
  if (source.index) part.setIndex(source.index.clone());
  part.applyMatrix4(matrix);
  const soup = part.index ? part.toNonIndexed() : part;
  return soup.getAttribute('position').array as Float32Array;
}

/** Splits a triangle soup into connected pieces: triangles that share a corner belong together. */
function splitPieces(soup: Float32Array): Float32Array[] {
  const corners = new Map<number, number>();
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const cornerOf = (offset: number) => {
    // Millimetre grid packed into one number: 18 bits for x and z (±131 m), 16 for y (±32 m).
    const x = Math.round(soup[offset] * 1000) + 131072;
    const y = Math.round(soup[offset + 1] * 1000) + 32768;
    const z = Math.round(soup[offset + 2] * 1000) + 131072;
    const key = (x * 65536 + y) * 262144 + z;
    let id = corners.get(key);
    if (id === undefined) {
      id = parent.length;
      parent.push(id);
      corners.set(key, id);
    }
    return id;
  };

  const triangleCount = soup.length / 9;
  const firstCorner = new Int32Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) {
    const a = cornerOf(t * 9);
    const b = cornerOf(t * 9 + 3);
    const c = cornerOf(t * 9 + 6);
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
    firstCorner[t] = a;
  }

  const pieces = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    const root = find(firstCorner[t]);
    let piece = pieces.get(root);
    if (!piece) pieces.set(root, (piece = []));
    for (let i = 0; i < 9; i++) piece.push(soup[t * 9 + i]);
  }
  return [...pieces.values()].map((piece) => new Float32Array(piece));
}

function isLowFurniture(piece: Float32Array, floor: number): boolean {
  let top = -Infinity;
  for (let i = 1; i < piece.length; i += 3) top = Math.max(top, piece[i]);
  return top > floor + FURNITURE_MIN_TOP && top < floor + FURNITURE_MAX_TOP;
}

function buildCollider(scene: Object3D): MeshBVH {
  scene.updateMatrixWorld(true);
  const soups: Float32Array[] = [stairRamp()];
  const trunk = new CylinderGeometry(TRUNK_RADIUS, TRUNK_RADIUS, TRUNK_HEIGHT, 10).translate(0, TRUNK_HEIGHT / 2, 0);
  const origin = new Vector3();
  const matrix = new Matrix4();

  scene.traverse((object) => {
    const group: string | undefined = object.userData.group;
    if (group === 'vegetation') {
      if (TREE_NAME.test(object.name)) {
        object.getWorldPosition(origin);
        soups.push(bake(trunk, matrix.makeTranslation(origin.x, origin.y, origin.z)));
      }
    } else if (object instanceof Mesh && isSolid(object)) {
      const soup = bake(object.geometry, object.matrixWorld);
      const floor = group === undefined ? undefined : FLOOR_LEVEL[group];
      if (floor === undefined) soups.push(soup);
      else soups.push(...splitPieces(soup).filter((piece) => !isLowFurniture(piece, floor)));
    }
  });

  const parts = soups.map((soup) => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(soup, 3)));
  return new MeshBVH(mergeGeometries(parts));
}

const colliders = new WeakMap<Object3D, MeshBVH>();

/** One BVH of everything solid in the model, in world space. Built once per scene. */
export function getCollider(scene: Object3D): MeshBVH {
  let collider = colliders.get(scene);
  if (!collider) {
    collider = buildCollider(scene);
    colliders.set(scene, collider);
  }
  return collider;
}

const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));

/** Height of the first solid surface straight below a point, or null if there is none. */
export function surfaceBelow(collider: MeshBVH, x: number, y: number, z: number): number | null {
  ray.origin.set(x, y, z);
  const hit = collider.raycastFirst(ray, DoubleSide);
  return hit ? hit.point.y : null;
}
