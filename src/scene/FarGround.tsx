import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { localToWorld, SLOPE } from './coords';
import { useCenterModel } from './Model';

/** Outer radius: always beyond the fog, and round so its silhouette has no corners. */
const RADIUS = 600;
// The terrain mesh (±45 m) lies exactly on the 15° plane beyond ±25 m, so the far ground can
// reach well under it. With a narrow overlap the 3 cm step shows as a bright gap when the
// site is seen from outside at a low angle. It must stay clear of the car park bays, though,
// which are cut into the hillside down to ly = 33.7 (parking.ts).
const HOLE = 34;
const DROP = 0.03;
/** A multiple of 8, so the corners of the square hole are sampled exactly. */
const SEGMENTS = 64;

/** The 15° hillside continued far beyond the terrain mesh: a disc with a square hole. */
export function FarGround() {
  const { materials } = useCenterModel();

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const addPoint = (lx: number, ly: number) =>
      positions.push(...localToWorld(lx, ly, -SLOPE * ly - DROP));

    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      addPoint(cos * RADIUS, sin * RADIUS);
      // Same direction, on the boundary of the square hole.
      const reach = HOLE / Math.max(Math.abs(cos), Math.abs(sin));
      addPoint(cos * reach, sin * reach);
    }

    const indices: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const outer = 2 * i;
      const nextOuter = 2 * ((i + 1) % SEGMENTS);
      indices.push(outer, nextOuter, nextOuter + 1, outer, nextOuter + 1, outer + 1);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // world X/Z in metres, like the terrain (ground.ts), so the grass texture runs on across the seam
    geo.setAttribute('uv', new Float32BufferAttribute(positions.filter((_, i) => i % 3 !== 1), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  return <mesh geometry={geometry} material={materials.grass} />;
}
