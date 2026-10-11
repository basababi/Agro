import { Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { slopeHeight } from './coords';

export type GroundSampler = (x: number, z: number) => number;

const DOWN = new Vector3(0, -1, 0);

/** Returns a function giving the ground height (three.js Y) under a world X/Z position. */
export function createGroundSampler(scene: Object3D): GroundSampler {
  let terrain: Mesh | undefined;
  scene.traverse((object) => {
    if (object instanceof Mesh && object.userData.group === 'terrain') terrain = object;
  });
  if (!terrain) return slopeHeight;

  const mesh = terrain;
  mesh.geometry.boundsTree ??= new MeshBVH(mesh.geometry);
  mesh.raycast = acceleratedRaycast;
  mesh.updateWorldMatrix(true, false);

  const raycaster = new Raycaster();
  raycaster.firstHitOnly = true;
  const origin = new Vector3();

  return (x, z) => {
    raycaster.set(origin.set(x, 500, z), DOWN);
    const hit = raycaster.intersectObject(mesh, false)[0];
    // Beyond the terrain mesh the hillside simply continues (FarGround).
    return hit ? hit.point.y : slopeHeight(x, z);
  };
}
