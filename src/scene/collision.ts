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
const PASSABLE_MATERIALS = new Set(['doorLeafFrame', 'screen', 'growlight', 'text', 'plant', 'water']);
/** Flower colours (outdoors only). */
const FLOWER_MATERIALS = new Set(['pink', 'yellow', 'purple', 'orange']);
/** Trees get a trunk cylinder; shrubs and crowns can be walked through. */
const TREE_NAME = /^(larch|pine|birch|poplar|elm)_/;
const TRUNK_RADIUS = 0.25;
const TRUNK_HEIGHT = 3;

function isSolid(mesh: Mesh): boolean {
  const material = (mesh.material as Material).name;
  // Thin overlays such as road markings, which lie on something solid anyway.
  if (mesh.userData.solid === false) return false;
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

function buildCollider(scene: Object3D): MeshBVH {
  scene.updateMatrixWorld(true);
  const soups: Float32Array[] = [];
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
      // Invisible meshes count too: the stair ramp exists only for the collider.
      soups.push(bake(object.geometry, object.matrixWorld));
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
