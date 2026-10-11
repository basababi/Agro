import { Sky } from '@react-three/drei';

// North is -Z, east is +X: the sun stands high in the south-west.
const SUN: [number, number, number] = [-52, 84, 52];
// Fog starts beyond the farthest zoom-out (120 m), so the model itself is never hazy,
// and is opaque long before the edge of the far ground (FarGround.tsx).
const FOG_NEAR = 120;
const FOG_FAR = 300;
/** Matches the sky just above the horizon, so the far ground fades into it. */
const FOG_COLOR = '#d2dde4';
// The physical sky is far brighter than the scene: at exposure 1 it tone-maps to white.
// Halve the exposure and double the lights instead.
export const EXPOSURE = 0.5;

export function Lighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      <Sky sunPosition={SUN} turbidity={10} rayleigh={2} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
      <hemisphereLight args={['#e3eef6', '#8d8f68', 2.5]} />
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
