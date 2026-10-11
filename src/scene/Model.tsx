import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect } from 'react';
import { Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';
import { useStore } from '../store';
import { getCollider } from './collision';

export const MODEL_URL = `/models/center.glb?v=${__MODEL_VERSION__}`;
/** Self-hosted Draco decoder (public/draco). */
export const DRACO_PATH = '/draco/';

export type ModelGroup =
  | 'terrain'
  | 'building'
  | 'floor1'
  | 'floor2'
  | 'greenhouse'
  | 'outdoor'
  | 'vegetation'
  | 'paths';

const GLASS = ['glass', 'gh_glass'];
// Emissive strength per material, tuned for the renderer's exposure and filmic tone mapping
// (see Lighting.tsx): stronger values burn the screens and grow lights out to white.
const EMISSIVE: Record<string, number> = { screen: 1.4, growlight: 3, text: 2.4 };

export function useCenterModel() {
  return useGLTF(MODEL_URL, DRACO_PATH);
}

function fixMaterials(materials: Record<string, Material>) {
  for (const [name, material] of Object.entries(materials)) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    if (GLASS.includes(name)) {
      material.transparent = true;
      material.opacity = 0.25;
      material.depthWrite = false;
    } else if (name === 'water') {
      material.transparent = true;
      material.opacity = 0.8;
    } else if (name in EMISSIVE) {
      if (material.emissive.getHex() === 0) material.emissive.copy(material.color);
      material.emissiveIntensity = EMISSIVE[name];
    }
  }
}

function prepareObjects(scene: Object3D) {
  scene.traverse((object) => {
    // Multi-material objects become a Group of meshes: pass the group tag down.
    if (object.userData.group === undefined && object.parent?.userData.group !== undefined) {
      object.userData.group = object.parent.userData.group;
    }
    if (!(object instanceof Mesh)) return;
    const material = object.material as Material;
    const flat = material.transparent || material.name in EMISSIVE;
    object.castShadow = !flat && object.userData.group !== 'terrain';
    object.receiveShadow = !flat;
  });
}

export function Model() {
  const { scene, materials } = useCenterModel();

  useLayoutEffect(() => {
    fixMaterials(materials);
    prepareObjects(scene);
  }, [scene, materials]);

  useEffect(() => {
    // Build the walk-mode collider while the loading screen is still up, so that entering
    // walk mode later does not freeze a phone for half a second.
    getCollider(scene);
    useStore.getState().setModelReady();
  }, [scene]);

  return <primitive object={scene} />;
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
