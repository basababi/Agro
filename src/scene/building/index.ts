// The building of the floor plans, built in code. It replaces the building, interiors and
// greenhouse of the Blender model (see site.ts for how it is placed on the site).

import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, type Material } from 'three';
import { Builder } from './builder';
import { buildFurniture, PASSABLE_FURNITURE } from './furniture';
import { buildGreenhouse } from './greenhouse';
import { createMaterials } from './materials';
import { buildOpenings } from './openings';
import { PLACEMENT } from './plan';
import { buildSlabs } from './slabs';
import { buildStair, stairRamp } from './stair';
import { buildWalls } from './walls';

/** Materials that must not stop the walker (thin, or doors shown open). */
const PASSABLE = new Set(['doorLeaf', 'growlight', 'plant', ...PASSABLE_FURNITURE]);

export function buildBuilding(modelMaterials: Record<string, Material>): Group {
  const material = createMaterials(modelMaterials);
  const shell = new Builder();
  const floor1 = new Builder();
  const floor2 = new Builder();
  const greenhouse = new Builder();

  buildWalls(shell, [floor1, floor2]);
  buildSlabs(shell);
  buildOpenings(shell, [floor1, floor2]);
  buildStair(floor1);
  buildFurniture(floor1, floor2);
  buildGreenhouse(greenhouse);

  const building = new Group();
  building.name = 'Building';
  for (const [name, group, builder] of [
    ['shell', 'building', shell],
    ['floor1', 'floor1', floor1],
    ['floor2', 'floor2', floor2],
    ['greenhouse', 'greenhouse', greenhouse],
  ] as const) {
    const part = new Group();
    part.name = `BLD_${name}`;
    part.userData.group = group;
    for (const [key, geometry] of builder.geometries()) {
      const mesh = new Mesh(geometry, material(key));
      mesh.name = `BLD_${name}_${key}`;
      if (PASSABLE.has(key)) mesh.userData.solid = false;
      part.add(mesh);
    }
    building.add(part);
  }

  // Invisible ramp over the stair nosings, for the walk-mode collider only.
  const rampGeometry = new BufferGeometry();
  rampGeometry.setAttribute('position', new Float32BufferAttribute(stairRamp(), 3));
  const ramp = new Mesh(rampGeometry, new MeshBasicMaterial({ visible: false }));
  ramp.name = 'BLD_stair_ramp';
  ramp.visible = false;
  ramp.userData.group = 'floor1';
  ramp.userData.collisionOnly = true;
  building.add(ramp);

  // Building frame → SITE_FRAME (x = lx, z = -ly): turned half round plus the placement angle.
  building.position.set(PLACEMENT.lx, 0, -PLACEMENT.ly);
  building.rotation.y = Math.PI + (PLACEMENT.rotation * Math.PI) / 180;
  return building;
}
