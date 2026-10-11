import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Euler, MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { spawn } from '../data/views';
import { useStore } from '../store';
import { clearWalkInput, pointerLockChanged, pointerLockFailed, walkInput } from '../walkInput';
import { getCollider, surfaceBelow } from './collision';
import { localToWorld, worldToLocal } from './coords';
import { useCenterModel } from './Model';
import { createPlayer, EYE_HEIGHT, stepPlayer } from './player';
import { createGroundSampler } from './terrain';

const WALK_SPEED = 2.0;
const RUN_SPEED = 4.5;
const FLY_SPEED = 4;
const FLY_FAST_SPEED = 9;
const FLY_CLIMB_SPEED = 3;
/** How quickly the walker reaches the wanted speed, m/s². */
const ACCELERATION = 24;
const MOUSE_SENSITIVITY = 0.0022;
const MAX_PITCH = MathUtils.degToRad(85);
/** The walker stays inside this site-local square (the terrain mesh ends at ±45 m). */
const SITE_LIMIT = 40;
const MAX_ALTITUDE = 60;
/** No single physics step moves further than this, so thin walls cannot be skipped. */
const MAX_STEP_DISTANCE = 0.03;
/** Flight of the camera from the overview into the walker's eyes, seconds. */
const INTRO_SECONDS = 0.9;
/** Vertical field of view: wider on portrait phones, where the view is narrow. */
const FOV_LANDSCAPE = 65;
const FOV_PORTRAIT = 85;
/** Head bob: one cycle per step. */
const BOB_HEIGHT = 0.015;
const BOB_PER_METRE = (2 * Math.PI) / 0.75;

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyF',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

// The walker outlives this component: going to the overview and back continues in place.
const player = createPlayer();
const view = { yaw: 0, pitch: 0 };
let spawned = false;
let respawnsHandled = 0;

function respawn() {
  const [px, py, pz] = spawn.pos;
  const [tx, ty, tz] = spawn.target;
  player.feet.set(px, py - EYE_HEIGHT, pz);
  player.velocityY = 0;
  player.onGround = false;
  view.yaw = Math.atan2(px - tx, pz - tz);
  view.pitch = Math.atan2(ty - py, Math.hypot(tx - px, tz - pz));
  spawned = true;
}

const held = (...codes: string[]) => (codes.some((code) => walkInput.keys.has(code)) ? 1 : 0);

const eye = new Vector3();
const orientation = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');

/** Walk mode: a first-person walker with gravity and collisions, or a free flight with F. */
export function WalkController() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const canvas = useThree((s) => s.gl.domElement);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const { scene } = useCenterModel();
  const collider = useMemo(() => getCollider(scene), [scene]);
  const groundAt = useMemo(() => createGroundSampler(scene), [scene]);
  const respawnCount = useStore((s) => s.respawnCount);

  const intro = useRef({ progress: 0, position: new Vector3(), quaternion: new Quaternion(), fov: 50 });
  const velocity = useRef({ x: 0, z: 0 });
  const eyeY = useRef<number | null>(null);
  const bob = useRef({ phase: 0, height: 0 });

  // Entering walk mode: fly the camera from wherever it is into the walker's eyes.
  useEffect(() => {
    if (!spawned) respawn();
    intro.current.progress = 0;
    intro.current.position.copy(camera.position);
    intro.current.quaternion.copy(camera.quaternion);
    intro.current.fov = camera.fov;
    eyeY.current = null;
    velocity.current.x = velocity.current.z = 0;
    return () => {
      clearWalkInput();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [camera, canvas]);

  useEffect(() => {
    if (respawnCount === respawnsHandled) return;
    respawnsHandled = respawnCount;
    respawn();
    eyeY.current = null;
    velocity.current.x = velocity.current.z = 0;
  }, [respawnCount]);

  useEffect(() => {
    const state = useStore.getState;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (state().walkPaused) return;
      if (MOVE_KEYS.has(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'KeyF') state().toggleFlying();
      // With a captured mouse the browser handles Esc itself and reports it as an unlock.
      if (event.code === 'Escape' && state().controlScheme === 'touch') state().setWalkPaused(true);
      walkInput.keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => walkInput.keys.delete(event.code);

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      // Some browsers report one huge jump right after the lock: ignore outliers.
      walkInput.lookYaw -= MathUtils.clamp(event.movementX, -300, 300) * MOUSE_SENSITIVITY;
      walkInput.lookPitch -= MathUtils.clamp(event.movementY, -300, 300) * MOUSE_SENSITIVITY;
    };

    const onLockChange = () => {
      if (state().controlScheme !== 'pointerlock') return;
      const locked = document.pointerLockElement === canvas;
      pointerLockChanged(locked);
      if (!locked) clearWalkInput();
      state().setWalkPaused(!locked);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearWalkInput);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', pointerLockFailed);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearWalkInput);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', pointerLockFailed);
    };
  }, [canvas]);

  useEffect(() => {
    // Dev only: lets a test script read and steer the walker.
    if (import.meta.env.DEV) {
      const probe = (x: number, y: number, z: number) => surfaceBelow(collider, x, y, z);
      // How far a capsule standing at this spot is pushed away by walls and furniture.
      const ghost = createPlayer();
      const squeeze = (x: number, y: number, z: number) => {
        ghost.feet.set(x, y, z);
        stepPlayer(ghost, collider, 0, 0, 0, { flying: true, climb: 0, jump: false });
        return Math.hypot(ghost.feet.x - x, ghost.feet.y - y, ghost.feet.z - z);
      };
      Object.assign(window, {
        __walk: { player, view, input: walkInput, store: useStore, collider, probe, squeeze, respawn },
      });
    }
  }, [collider]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const { walkPaused, flying, running } = useStore.getState();
    const { feet } = player;

    // Look around.
    if (!walkPaused) {
      view.yaw += walkInput.lookYaw;
      view.pitch = MathUtils.clamp(view.pitch + walkInput.lookPitch, -MAX_PITCH, MAX_PITCH);
    }
    walkInput.lookYaw = 0;
    walkInput.lookPitch = 0;

    // Wanted movement, relative to where the walker looks.
    let forward = 0;
    let strafe = 0;
    let climb = 0;
    let jump = false;
    let fast = false;
    if (!walkPaused) {
      forward = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown') + walkInput.stickY;
      strafe = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft') + walkInput.stickX;
      const length = Math.hypot(forward, strafe);
      if (length > 1) {
        forward /= length;
        strafe /= length;
      }
      climb = Math.max(held('KeyE'), +walkInput.up) - Math.max(held('KeyQ'), +walkInput.down);
      jump = held('Space') === 1;
      fast = running || held('ShiftLeft', 'ShiftRight') === 1;
    }
    const speed = flying ? (fast ? FLY_FAST_SPEED : FLY_SPEED) : fast ? RUN_SPEED : WALK_SPEED;
    const sin = Math.sin(view.yaw);
    const cos = Math.cos(view.yaw);
    const wantX = (-sin * forward + cos * strafe) * speed;
    const wantZ = (-cos * forward - sin * strafe) * speed;

    // Ease into the wanted speed instead of starting and stopping abruptly.
    const v = velocity.current;
    const change = Math.hypot(wantX - v.x, wantZ - v.z);
    const eased = Math.min(1, (ACCELERATION * delta) / (change || 1));
    v.x += (wantX - v.x) * eased;
    v.z += (wantZ - v.z) * eased;

    const startX = feet.x;
    const startZ = feet.z;
    const fastest = Math.max(Math.hypot(v.x, v.z), Math.abs(player.velocityY), FLY_CLIMB_SPEED);
    const steps = MathUtils.clamp(Math.ceil((fastest * delta) / MAX_STEP_DISTANCE), 3, 16);
    const dt = delta / steps;
    const options = { flying, climb: climb * FLY_CLIMB_SPEED, jump };
    for (let i = 0; i < steps; i++) stepPlayer(player, collider, v.x * dt, v.z * dt, dt, options);

    // Stay on the site, above the terrain and below the sky.
    const [lx, ly] = worldToLocal(feet.x, feet.z);
    if (Math.abs(lx) > SITE_LIMIT || Math.abs(ly) > SITE_LIMIT) {
      const clampLocal = (value: number) => MathUtils.clamp(value, -SITE_LIMIT, SITE_LIMIT);
      const [x, , z] = localToWorld(clampLocal(lx), clampLocal(ly));
      feet.x = x;
      feet.z = z;
    }
    const ground = groundAt(feet.x, feet.z);
    if (feet.y < ground - 0.5) {
      feet.y = ground;
      player.velocityY = 0;
    }
    feet.y = Math.min(feet.y, MAX_ALTITUDE);

    // Eye height follows the feet softly, so steps and stairs do not jolt the view.
    const eyeTarget = feet.y + EYE_HEIGHT;
    eyeY.current =
      eyeY.current === null || Math.abs(eyeTarget - eyeY.current) > 1
        ? eyeTarget
        : MathUtils.damp(eyeY.current, eyeTarget, 18, delta);

    const walked = Math.hypot(feet.x - startX, feet.z - startZ);
    const stepping = player.onGround && !flying && walked > 1e-4;
    if (stepping) bob.current.phase += walked * BOB_PER_METRE;
    bob.current.height = MathUtils.damp(bob.current.height, stepping ? BOB_HEIGHT : 0, 8, delta);

    eye.set(feet.x, eyeY.current + Math.sin(bob.current.phase) * bob.current.height, feet.z);
    orientation.setFromEuler(euler.set(view.pitch, view.yaw, 0));
    const fov = MathUtils.clamp(
      MathUtils.mapLinear(aspect, 0.8, 1.2, FOV_PORTRAIT, FOV_LANDSCAPE),
      FOV_LANDSCAPE,
      FOV_PORTRAIT,
    );

    const start = intro.current;
    if (start.progress < 1) {
      start.progress = Math.min(1, start.progress + delta / INTRO_SECONDS);
      const t = MathUtils.smootherstep(start.progress, 0, 1);
      camera.position.lerpVectors(start.position, eye, t);
      camera.quaternion.slerpQuaternions(start.quaternion, orientation, t);
      camera.fov = MathUtils.lerp(start.fov, fov, t);
      camera.updateProjectionMatrix();
    } else {
      camera.position.copy(eye);
      camera.quaternion.copy(orientation);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}
