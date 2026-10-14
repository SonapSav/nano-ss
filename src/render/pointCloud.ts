import {
  AdditiveBlending,
  InstancedBufferAttribute,
  PointsNodeMaterial,
  Sprite,
} from 'three/webgpu';
import { instancedBufferAttribute, instancedDynamicBufferAttribute, uniform } from 'three/tsl';

export const createBrightness = () => uniform(1);
export type Brightness = ReturnType<typeof createBrightness>;

/**
 * Screen-sized points (WebGPU points are 1 px natively, so three.js draws
 * them as an instanced Sprite with PointsNodeMaterial). With `dynamic`, the
 * returned position attribute can be rewritten each frame.
 */
export function createPointCloud(
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  {
    brightness = createBrightness(),
    dynamic = false,
  }: { brightness?: Brightness; dynamic?: boolean } = {},
) {
  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: false,
  });
  const positionAttribute = new InstancedBufferAttribute(positions, 3);
  material.positionNode = dynamic
    ? instancedDynamicBufferAttribute(positionAttribute, 'vec3')
    : instancedBufferAttribute(positionAttribute, 'vec3');
  material.colorNode = instancedBufferAttribute<'vec3'>(
    new InstancedBufferAttribute(colors, 3),
    'vec3',
  ).mul(brightness);
  material.sizeNode = instancedBufferAttribute(new InstancedBufferAttribute(sizes, 1), 'float');
  const sprite = new Sprite(material);
  sprite.count = sizes.length;
  sprite.frustumCulled = false;
  return { sprite, positionAttribute };
}
