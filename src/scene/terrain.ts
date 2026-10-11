import { Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { slopeHeight, worldToLocal } from './coords';
import { roadSurface } from './parking';

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
  mesh.raycast = acceleratedRaycast;
  mesh.updateWorldMatrix(true, false);

  const raycaster = new Raycaster();
  raycaster.firstHitOnly = true;
  const origin = new Vector3();

  return (x, z) => {
    // Built on first use: the terrain geometry is replaced once, when the car park is cut in.
    mesh.geometry.boundsTree ??= new MeshBVH(mesh.geometry);
    raycaster.set(origin.set(x, 500, z), DOWN);
    const hit = raycaster.intersectObject(mesh, false)[0];
    // Beyond the terrain mesh the hillside simply continues (FarGround).
    const ground = hit ? hit.point.y : slopeHeight(x, z);
    // The access road is built up above the hillside.
    return Math.max(ground, roadSurface(worldToLocal(x, z)[1]));
  };
}
