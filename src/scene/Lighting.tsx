import { Environment, Sky } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { Color, Matrix4, Vector3, type HemisphereLight, type Object3D } from 'three';
import { LEVEL } from './building/plan';
import { insideRing } from './building/site';

// North is -Z, east is +X: the sun stands high in the south-west.
const SUN: [number, number, number] = [-52, 84, 52];
const SKY = { sunPosition: SUN, turbidity: 10, rayleigh: 2, mieCoefficient: 0.005, mieDirectionalG: 0.8 };
// Fog starts beyond the farthest zoom-out (120 m), so the model itself is never hazy,
// and is opaque long before the edge of the far ground (FarGround.tsx).
const FOG_NEAR = 120;
const FOG_FAR = 300;
/** Matches the sky just above the horizon, so the far ground fades into it. */
const FOG_COLOR = '#d2dde4';
// The physical sky is far brighter than the scene: at exposure 1 it tone-maps to white.
// Halve the exposure and double the lights instead.
export const EXPOSURE = 0.5;
/** Ground under the sky in the environment map: what shaded undersides and ceilings see. */
const ENV_GROUND = '#c9c4b8';
const ENV_INTENSITY = 0.45;

// Indoors the eye adapts to the dimmer light, and the light that fills a room has bounced off
// its floor and white walls rather than come from the blue sky. Both are eased in when the
// camera goes inside the building and out again when it leaves.
const EXPOSURE_INDOORS = 0.74;
const HEMISPHERE = { sky: new Color('#e3eef6'), ground: new Color('#d4d0c6') };
const HEMISPHERE_INDOORS = { sky: new Color('#f3f0ea'), ground: new Color('#e0d9cc') };
const ADAPTATION_RATE = 2;

function useIndoorAdaptation(hemisphere: RefObject<HemisphereLight | null>) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const building = useRef<Object3D | null>(null);
  const state = useMemo(() => ({ indoors: 0, inverse: new Matrix4(), local: new Vector3() }), []);

  useFrame(({ camera }, delta) => {
    building.current ??= scene.getObjectByName('Building') ?? null;
    let inside = false;
    if (building.current) {
      state.inverse.copy(building.current.matrixWorld).invert();
      const p = state.local.copy(camera.position).applyMatrix4(state.inverse);
      inside = p.y > LEVEL.f1 && p.y < LEVEL.roof && insideRing([p.x, p.z], -0.3);
    }
    state.indoors += ((inside ? 1 : 0) - state.indoors) * Math.min(1, delta * ADAPTATION_RATE);
    gl.toneMappingExposure = EXPOSURE + (EXPOSURE_INDOORS - EXPOSURE) * state.indoors;
    const light = hemisphere.current;
    if (light) {
      light.color.copy(HEMISPHERE.sky).lerp(HEMISPHERE_INDOORS.sky, state.indoors);
      light.groundColor.copy(HEMISPHERE.ground).lerp(HEMISPHERE_INDOORS.ground, state.indoors);
    }
  });
}

export function Lighting({ shadows }: { shadows: boolean }) {
  const hemisphere = useRef<HemisphereLight>(null);
  useIndoorAdaptation(hemisphere);

  return (
    <>
      <Sky {...SKY} />
      {/* Image-based light: the same sky over a warm ground, rendered once into a cube map. It gives
          glass, metal and porcelain their reflections and fills every face with soft light. */}
      <Environment frames={1} resolution={128} environmentIntensity={ENV_INTENSITY}>
        <Sky {...SKY} />
        <mesh rotation-x={-Math.PI / 2} position-y={-2}>
          <circleGeometry args={[900, 32]} />
          <meshBasicMaterial color={ENV_GROUND} />
        </mesh>
      </Environment>
      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
      {/* A light ground colour: it is what ceilings and the shaded undersides of things get. */}
      <hemisphereLight ref={hemisphere} args={[HEMISPHERE.sky, HEMISPHERE.ground, 1.6]} />
      <directionalLight
        position={SUN}
        intensity={5.2}
        color="#fff4e2"
        castShadow={shadows}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      >
        {/* Wide enough for the site and the car park below the gate. */}
        <orthographicCamera attach="shadow-camera" args={[-46, 46, 46, -46, 20, 220]} />
      </directionalLight>
    </>
  );
}
