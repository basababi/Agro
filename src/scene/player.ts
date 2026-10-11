// First-person capsule moving through the collider. Based on the three-mesh-bvh
// "characterMovement" example, with ground handling suited to a site that is one big slope:
// floors and gentle slopes push the capsule straight up (no creeping downhill, constant
// walking speed), low steps are rolled over, everything else is a wall.

import { Box3, DoubleSide, Line3, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

export const RADIUS = 0.3;
export const HEIGHT = 1.7;
export const EYE_HEIGHT = 1.65;

const GRAVITY = -9.8;
/** A small hop of about 0.35 m. */
const JUMP_SPEED = 2.6;
const MAX_FALL_SPEED = 20;
/** Surfaces up to 50° can be stood on. */
const WALKABLE_FACE = Math.cos((50 * Math.PI) / 180);
/** Steps up to this high are climbed (stair risers are 0.195 m). */
const MAX_STEP_HEIGHT = 0.22;
/** While walking the capsule is pressed down by this much per metre, to follow descending ground. */
const STICK = 1.5;

export interface Player {
  /** Bottom of the capsule. */
  feet: Vector3;
  velocityY: number;
  onGround: boolean;
}

export interface StepOptions {
  flying: boolean;
  /** Vertical speed while flying, m/s. */
  climb: number;
  jump: boolean;
}

export function createPlayer(): Player {
  return { feet: new Vector3(), velocityY: 0, onGround: false };
}

const segment = new Line3();
const bounds = new Box3();
const triPoint = new Vector3();
const capsulePoint = new Vector3();
const direction = new Vector3();
const normal = new Vector3();
const down = new Ray(new Vector3(), new Vector3(0, -1, 0));
/** Low edges met by the feet in one step; decided after the walls and floors are resolved. */
const edges = Array.from({ length: 24 }, () => new Vector3());

/**
 * Is there something to stand on just behind this edge, at about its height? True for a stair
 * nosing or a kerb, false for the seam between two triangles of a wall.
 */
function hasTread(collider: MeshBVH, edge: Vector3, awayX: number, awayZ: number, stepFloor: number): boolean {
  down.origin.set(edge.x - awayX * 0.04, stepFloor + MAX_STEP_HEIGHT + 0.02, edge.z - awayZ * 0.04);
  const hit = collider.raycastFirst(down, DoubleSide);
  return hit !== null && hit !== undefined && hit.point.y >= edge.y - 0.04;
}

/** Advances the player by one small time step: (dx, dz) is the wanted horizontal move. */
export function stepPlayer(
  player: Player,
  collider: MeshBVH,
  dx: number,
  dz: number,
  dt: number,
  { flying, climb, jump }: StepOptions,
) {
  const { feet } = player;
  // Steps are measured from where the feet stood, not from where the press-down below puts them.
  let stepFloor = feet.y;
  let dy: number;
  if (flying) {
    player.velocityY = 0;
    dy = climb * dt;
  } else if (player.onGround && jump) {
    player.velocityY = JUMP_SPEED;
    dy = JUMP_SPEED * dt;
  } else if (player.onGround) {
    player.velocityY = 0;
    dy = -(Math.hypot(dx, dz) * STICK + 0.003);
  } else {
    player.velocityY = Math.max(player.velocityY + GRAVITY * dt, -MAX_FALL_SPEED);
    dy = player.velocityY * dt;
    stepFloor += dy;
  }
  feet.x += dx;
  feet.y += dy;
  feet.z += dz;

  const bottom = segment.start.set(feet.x, feet.y + RADIUS, feet.z);
  const top = segment.end.set(feet.x, feet.y + HEIGHT - RADIUS, feet.z);
  bounds.min.set(bottom.x - RADIUS, bottom.y - RADIUS, bottom.z - RADIUS);
  bounds.max.set(top.x + RADIUS, top.y + RADIUS, top.z + RADIUS);
  const rising = player.velocityY > 0;
  let grounded = false;
  let bumpedHead = false;
  let edgeCount = 0;

  const shift = (x: number, y: number, z: number) => {
    bottom.x += x;
    bottom.y += y;
    bottom.z += z;
    top.x += x;
    top.y += y;
    top.z += z;
  };

  collider.shapecast({
    intersectsBounds: (box) => box.intersectsBox(bounds),
    intersectsTriangle: (triangle) => {
      const distance = triangle.closestPointToSegment(segment, triPoint, capsulePoint);
      if (distance >= RADIUS) return;
      const depth = RADIUS - distance;
      if (distance > 1e-6) {
        direction.subVectors(capsulePoint, triPoint).divideScalar(distance);
      } else {
        // The capsule axis touches the triangle itself: leave through its upper side.
        triangle.getNormal(direction);
        if (direction.y < 0) direction.negate();
      }

      if (flying) {
        shift(direction.x * depth, direction.y * depth, direction.z * depth);
        return;
      }

      // Ground: only what the bottom of the capsule rests on.
      if (direction.y > 0 && capsulePoint.y <= bottom.y + 1e-4) {
        const onFace = Math.abs(direction.dot(triangle.getNormal(normal))) > 0.98;
        if (onFace && direction.y >= WALKABLE_FACE) {
          // A floor or slope: rise straight up until the capsule only touches it.
          shift(0, depth / direction.y, 0);
          grounded = true;
          return;
        }
        if (!onFace && triPoint.y <= stepFloor + MAX_STEP_HEIGHT && edgeCount < edges.length) {
          edges[edgeCount++].copy(triPoint);
          return;
        }
      }

      // Ceiling, when jumping into it.
      if (rising && direction.y < -0.5) {
        shift(direction.x * depth, direction.y * depth, direction.z * depth);
        bumpedHead = true;
        return;
      }

      // Wall: move away sideways only, so walls neither lift the player nor press them down.
      const horizontal = direction.x * direction.x + direction.z * direction.z;
      if (horizontal > 0.01) {
        const push = depth / horizontal;
        shift(direction.x * push, 0, direction.z * push);
      }
    },
  });

  // Low edges: roll over real steps, slide off anything else.
  for (let i = 0; i < edgeCount; i++) {
    const edge = edges[i];
    const awayX = bottom.x - edge.x;
    const awayZ = bottom.z - edge.z;
    const sideways = Math.hypot(awayX, awayZ);
    const above = bottom.y - edge.y;
    if (sideways * sideways + above * above >= RADIUS * RADIUS) continue;

    const reach = Math.sqrt(RADIUS * RADIUS - sideways * sideways);
    if (sideways < 1e-4 || hasTread(collider, edge, awayX / sideways, awayZ / sideways, stepFloor)) {
      shift(0, reach - above, 0);
      grounded = true;
    } else {
      const push = Math.sqrt(RADIUS * RADIUS - above * above) / sideways - 1;
      shift(awayX * push, 0, awayZ * push);
    }
  }

  feet.set(bottom.x, bottom.y - RADIUS, bottom.z);
  if (flying) {
    player.onGround = false;
  } else {
    if (grounded || bumpedHead) player.velocityY = Math.min(player.velocityY, 0);
    player.onGround = grounded;
  }
}
