import type { CompressedTexture, WebGPURenderer } from 'three/webgpu';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export const TEXTURE_NAMES = [
  'earth-day',
  'earth-night',
  'earth-clouds',
  'moon-color',
  'moon-normal',
  'site-tranquility',
  'site-shackleton',
] as const;
export type TextureName = (typeof TEXTURE_NAMES)[number];
/** Relief and other extras: the game still runs without them. */
const OPTIONAL: readonly TextureName[] = ['moon-normal', 'site-tranquility', 'site-shackleton'];

/**
 * Loads the GPU-compressed KTX2 textures built by `make scenery` (D-022).
 * The Basis transcoder in public/basis/ turns them into whatever compressed
 * format the GPU supports, so they use 4 to 8 times less video memory.
 */
export async function loadTextures(
  renderer: WebGPURenderer,
): Promise<Partial<Record<TextureName, CompressedTexture>>> {
  const loader = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
  const entries = await Promise.all(
    TEXTURE_NAMES.map(async (name) => {
      try {
        return [name, await loader.loadAsync(`textures/${name}.ktx2`)] as const;
      } catch (error) {
        if (!OPTIONAL.includes(name)) throw error;
        console.warn(`[nano-ss] optional texture ${name} not available`, error);
        return null;
      }
    }),
  );
  loader.dispose();
  return Object.fromEntries(entries.filter((e) => e !== null));
}
