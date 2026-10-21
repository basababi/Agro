// Grass on the hillside. The terrain, the far ground and the car park's embankment share the
// model's grass material. They get UVs from their world X/Z (metres), so the texture runs on
// across all three, and the shader darkens and lightens it in broad, soft patches (value noise
// over 7 m and 23 m) so that the 4 m texture does not show as a repeating pattern from above.

import { Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three';
import { texture } from './textures';

const NOISE = /* glsl */ `
float grassHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float grassNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grassHash(i), grassHash(i + vec2(1.0, 0.0)), f.x), mix(grassHash(i + vec2(0.0, 1.0)), grassHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  // vMapUv is world X/Z divided by the texture's 4 m
  vec2 grassWorld = vMapUv * 4.0;
  float grassPatch = grassNoise( grassWorld / 23.0 ) * 0.6 + grassNoise( grassWorld / 7.0 ) * 0.4;
  sampledDiffuseColor.rgb *= mix( vec3( 0.8, 0.86, 0.78 ), vec3( 1.12, 1.08, 0.98 ), grassPatch );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/** UVs from world X/Z, for a mesh whose geometry is in its own (static) frame. */
export function addWorldUVs(mesh: Mesh) {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    uv[2 * i] = v.x;
    uv[2 * i + 1] = v.z;
  }
  mesh.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}

/** Gives the grass material its texture and every mesh using it world UVs. */
export function texturizeGround(scene: Object3D, grass: Material | undefined) {
  if (!(grass instanceof MeshStandardMaterial) || grass.userData.textured) return;
  scene.traverse((object) => {
    if (object instanceof Mesh && object.material === grass) addWorldUVs(object);
  });
  grass.map = texture('grass');
  grass.color.set('#ffffff');
  grass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT);
  };
  grass.userData.textured = true;
  grass.needsUpdate = true;
}
