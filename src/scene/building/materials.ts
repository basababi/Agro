// Materials of the new building, keyed by the names the builders use. Where the model already has
// a material of the same kind (glass, stone, the planting …) it is reused. Textured materials get
// a procedural texture (textures.ts); the builders' UVs are in metres, so they keep their real size.

import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';
import { texture, type TextureName } from '../textures';

type Spec = {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  map?: TextureName;
};

const OWN: Record<string, Spec> = {
  // walls and slabs
  facade: { color: '#ebe5da', roughness: 0.92, map: 'render' },
  reveal: { color: '#e0d9cd', roughness: 0.9, map: 'render' },
  plaster: { color: '#f5f2ec', roughness: 0.95, map: 'plaster' },
  ceiling: { color: '#f7f5f1', roughness: 0.95 },
  slabEdge: { color: '#d8d2c6', roughness: 0.9, map: 'render' },
  parapet: { color: '#b9b5ae', roughness: 0.6, metalness: 0.3 },
  plinth: { color: '#8c877e', roughness: 0.95, map: 'stoneCourses' },
  roofGreen: { color: '#ffffff', roughness: 1, map: 'sedum' },
  // floors
  floor: { color: '#ffffff', roughness: 0.55, map: 'woodFloor' },
  floorTile: { color: '#e9e8e4', roughness: 0.35, map: 'tiles' },
  floorVinyl: { color: '#d5d6d0', roughness: 0.5, map: 'vinyl' },
  stairTread: { color: '#a77a4f', roughness: 0.5, map: 'woodGrain' },
  ghFloor: { color: '#a8a39a', roughness: 0.85, map: 'paving' },
  // openings
  windowFrame: { color: '#3c4247', roughness: 0.45, metalness: 0.55 },
  metalDark: { color: '#3a3f44', roughness: 0.4, metalness: 0.6 },
  doorFrame: { color: '#e4e0d8', roughness: 0.6 },
  doorLeafFrame: { color: '#e4e0d8', roughness: 0.6 },
  doorLeaf: { color: '#c08f60', roughness: 0.5, map: 'woodGrain' },
  woodLight: { color: '#d6ad7c', roughness: 0.55, map: 'woodGrain' },
  sill: { color: '#a9a49a', roughness: 0.8 },
  skirting: { color: '#cdc6b9', roughness: 0.6 },
  ghFrame: { color: '#d9dde0', roughness: 0.35, metalness: 0.6 },
  // furniture and fittings
  furnWood: { color: '#e2b98c', roughness: 0.5, map: 'woodGrain' },
  furnWoodDark: { color: '#8a5f3e', roughness: 0.5, map: 'woodGrain' },
  laminate: { color: '#f0eee8', roughness: 0.45 },
  worktop: { color: '#2f3437', roughness: 0.3 },
  steel: { color: '#c6cacd', roughness: 0.3, metalness: 0.85 },
  chairSeat: { color: '#3e6a55', roughness: 0.85 },
  chairFrame: { color: '#2b2f33', roughness: 0.4, metalness: 0.6 },
  porcelain: { color: '#f8f8f6', roughness: 0.1 },
  whiteboard: { color: '#fbfbfa', roughness: 0.18 },
  touchScreen: { color: '#0f171c', roughness: 0.15, emissive: '#2c6d8c', emissiveIntensity: 0.55 },
  lamp: { color: '#ffffff', roughness: 0.5, emissive: '#fff4de', emissiveIntensity: 2.2 },
  lampHousing: { color: '#f3f3f1', roughness: 0.5 },
  pot: { color: '#a0623f', roughness: 0.9 },
  mirror: { color: '#d7dee2', roughness: 0.06, metalness: 0.9 },
  books: { color: '#ffffff', roughness: 0.8, map: 'books' },
  timeline: { color: '#ffffff', roughness: 0.8, map: 'timeline' },
  labEquipment: { color: '#e5e9e7', roughness: 0.48, metalness: 0.1 },
  labEquipmentDark: { color: '#35464c', roughness: 0.38, metalness: 0.2 },
  exhibitWater: { color: '#75c4ce', roughness: 0.18, metalness: 0.06 },
  equipmentIndicator: { color: '#78c59a', roughness: 0.28, emissive: '#52d98a', emissiveIntensity: 0.65 },
  equipmentRubber: { color: '#252a2b', roughness: 0.86, metalness: 0.02 },
  labScreen: { color: '#142c32', roughness: 0.2, emissive: '#2d7374', emissiveIntensity: 0.42 },
  chemicalCabinet: { color: '#cfb85b', roughness: 0.55 },
  linen: { color: '#dce4dc', roughness: 0.95 },
  seasonSpring: { color: '#8ebd72', roughness: 0.72 },
  seasonSummer: { color: '#477f4d', roughness: 0.72 },
  seasonAutumn: { color: '#cb8a43', roughness: 0.72 },
  seasonWinter: { color: '#d5e1e4', roughness: 0.72 },
};

/** Keys taken over from the model's own materials (by material name). */
const FROM_MODEL: Record<string, string> = {
  windowGlass: 'glass',
  railGlass: 'glass',
  ghGlass: 'gh_glass',
  stone: 'stone',
  solar: 'solar',
  wood: 'wood',
  soil: 'soil',
  plant: 'plant',
  growlight: 'growlight',
};

export function createMaterials(model: Record<string, Material>): (key: string) => Material {
  const cache = new Map<string, Material>();
  return (key) => {
    let material = cache.get(key);
    if (material) return material;
    const reuse = FROM_MODEL[key];
    if (reuse && model[reuse]) material = model[reuse];
    else if (key === 'contactShadow') {
      // unlit and transparent: darkens the floor around furniture whatever the light
      material = new MeshBasicMaterial({ color: '#000000', map: texture('softShadow'), transparent: true, opacity: 0.42, depthWrite: false });
      material.name = 'bld_contactShadow';
    } else {
      const spec = OWN[key] ?? { color: '#ff00ff' };
      const m = new MeshStandardMaterial({
        color: spec.color,
        roughness: spec.roughness ?? 0.8,
        metalness: spec.metalness ?? 0,
        side: DoubleSide,
      });
      if (spec.map) m.map = texture(spec.map);
      if (spec.emissive) {
        m.emissive.set(spec.emissive);
        m.emissiveIntensity = spec.emissiveIntensity ?? 1;
      }
      m.name = `bld_${key}`;
      material = m;
    }
    cache.set(key, material);
    return material;
  };
}
