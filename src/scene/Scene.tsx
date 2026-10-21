import { useProgress } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { presets } from '../data/views';
import { isTouchDevice, useStore } from '../store';
import { FarGround } from './FarGround';
import { EXPOSURE, Lighting } from './Lighting';
import { Model } from './Model';
import { OrbitRig } from './OrbitRig';
import { WalkController } from './WalkController';

/** Forwards drei's loading progress to the store, so the UI shell does not import three. */
function ProgressBridge() {
  const progress = useProgress((s) => s.progress);
  useEffect(() => {
    useStore.getState().setProgress(progress);
  }, [progress]);
  return null;
}

/** Exactly one rig owns the camera at a time. */
function CameraRig() {
  const mode = useStore((s) => s.mode);
  return mode === 'walk' ? <WalkController /> : <OrbitRig />;
}

export default function Scene() {
  return (
    <Canvas
      className="scene"
      shadows={isTouchDevice ? false : 'percentage'}
      dpr={[1, isTouchDevice ? 1.5 : 1.75]}
      gl={{ toneMappingExposure: EXPOSURE }}
      // Shader diagnostics only while developing: in production they cost synchronous GL calls,
      // and ANGLE on Windows logs a harmless precision note for three's environment-map shader.
      onCreated={({ gl }) => {
        gl.debug.checkShaderErrors = import.meta.env.DEV;
      }}
      camera={{ position: presets.aerial.pos, fov: 50, near: 0.1, far: 900 }}
    >
      <ProgressBridge />
      <Lighting shadows={!isTouchDevice} />
      <Suspense fallback={null}>
        <Model />
        <FarGround />
        <CameraRig />
      </Suspense>
    </Canvas>
  );
}
