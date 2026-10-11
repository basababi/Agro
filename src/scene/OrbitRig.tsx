import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { presets, type Vec3, type View } from '../data/views';
import { useStore } from '../store';
import { useCenterModel } from './Model';
import { createGroundSampler } from './terrain';

/** The orbit target may not be panned away from the site. */
const TARGET_BOUNDS = new Box3(new Vector3(-40, -12, -40), new Vector3(40, 14, 40));
const MIN_DISTANCE = 3;
const MAX_DISTANCE = 120;
const FOV = 50;
/** Narrowest screen aspect ratio at which the aerial preset still shows the whole site. */
const AERIAL_FIT_ASPECT = 1.27;
/** Minimum camera height above the terrain, metres. */
const CLEARANCE = 0.6;
/** Slow turntable behind the start screen, rad/s. */
const IDLE_SPIN = 0.05;

const position = new Vector3();
const target = new Vector3();

/** False until the very first view has been set: later visits fly in from walk mode. */
let opened = false;

/** The aerial preset is framed for landscape screens: on a narrow one, pull back until the site fits. */
function aerialView(aspect: number): View {
  const { pos, target } = presets.aerial;
  const offset = pos.map((p, i) => p - target[i]);
  const scale = MathUtils.clamp(AERIAL_FIT_ASPECT / aspect, 1, MAX_DISTANCE / Math.hypot(...offset));
  return { pos: target.map((t, i) => t + offset[i] * scale) as Vec3, target };
}

/** Overview mode: orbit / pan / zoom around the site. */
export function OrbitRig() {
  const controls = useRef<CameraControls>(null);
  const { scene } = useCenterModel();
  const groundAt = useMemo(() => createGroundSampler(scene), [scene]);
  const aspect = useThree((s) => s.size.width / s.size.height);
  /** Animated flights in progress. */
  const flights = useRef(0);

  const flyTo = (view: View, animate: boolean) => {
    const c = controls.current;
    if (!c) return;
    const arrived = c.setLookAt(...view.pos, ...view.target, animate);
    if (!animate) return;
    flights.current += 1;
    void arrived.finally(() => {
      flights.current -= 1;
    });
  };

  useEffect(() => {
    controls.current?.setBoundary(TARGET_BOUNDS);
    // Dev only: drive the camera from the browser console or a screenshot script.
    if (import.meta.env.DEV) Object.assign(window, { __orbit: controls.current, __scene: scene.parent });
  }, [scene]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (opened) {
      // Coming back from walk mode: start the orbit from the walker's view, then rise.
      const { camera } = c;
      camera.getWorldDirection(target).multiplyScalar(15).add(camera.position);
      void c.setLookAt(camera.position.x, camera.position.y, camera.position.z, target.x, target.y, target.z, false);
    }
    flyTo(aerialView(aspect), opened);
    opened = true;
  }, []);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;

    if (!useStore.getState().started) c.rotate(IDLE_SPIN * delta, 0, true);

    // Walk mode uses a wider lens: ease back.
    const camera = c.camera as PerspectiveCamera;
    if (camera.fov !== FOV) {
      camera.fov = Math.abs(camera.fov - FOV) < 0.05 ? FOV : MathUtils.damp(camera.fov, FOV, 5, delta);
      camera.updateProjectionMatrix();
    }

    // Keep the camera above the terrain.
    c.getPosition(position, false);
    const minY = groundAt(position.x, position.z) + CLEARANCE;
    if (position.y >= minY) return;

    c.getTarget(target, false);
    const cos = (minY - target.y) / position.distanceTo(target);
    if (flights.current > 0 || cos > 1) {
      // A flight between two views may cut through the hillside, and a target panned deep
      // into the hill cannot be orbited out of it: lift the rendered camera only, so the
      // destination of the flight stays exactly as requested.
      c.camera.position.y = minY;
    } else {
      // The user orbited into the ground: tilt the orbit back up.
      c.rotatePolarTo(Math.acos(Math.max(cos, -1)), false);
    }
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      maxPolarAngle={Math.PI * 0.65}
      smoothTime={0.3}
      draggingSmoothTime={0.12}
    />
  );
}
