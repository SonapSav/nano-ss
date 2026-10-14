import { Color } from 'three/webgpu';
import { createPointCloud } from './pointCloud';

/** Approximate star colour from the B−V index (blue-white hot stars to orange cool ones). */
export function starColor(bv: number, out: Color): Color {
  const t = Math.min(Math.max((bv + 0.3) / 2.0, 0), 1); // 0 = hot (B−V −0.3), 1 = cool (B−V 1.7)
  return out.setRGB(0.75 + 0.25 * t, 0.82 + 0.1 * (1 - Math.abs(t - 0.4)), 1 - 0.55 * t);
}

/** Brightness (0..1) and point size (px) from the visual magnitude. */
export function starAppearance(vmag: number): { brightness: number; size: number } {
  const flux = Math.pow(10, -0.4 * (vmag - 1)); // magnitude 1 star = 1
  return {
    brightness: Math.min(1, 0.12 + Math.sqrt(flux) * 0.9),
    size: Math.min(4.5, 1.2 + Math.max(0, 3.2 - vmag * 0.55)),
  };
}

/**
 * Real sky from the Yale Bright Star Catalogue (public/data/stars.bin,
 * [x, y, z, Vmag, B−V], ICRF). Same frame as the world, so constellations
 * are where they really are. Drawn first, without depth, behind everything.
 */
export async function loadStarfield(url: string, radius = 50_000) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${String(response.status)}`);
  const data = new Float32Array(await response.arrayBuffer());
  const count = data.length / 5;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const [x = 0, y = 0, z = 0, vmag = 6, bv = 0.6] = data.subarray(i * 5, i * 5 + 5);
    positions.set([x * radius, y * radius, z * radius], i * 3);
    const { brightness, size } = starAppearance(vmag);
    starColor(bv, c).multiplyScalar(brightness);
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = size;
  }
  const { sprite } = createPointCloud(positions, colors, sizes);
  // In the opaque pass and first in it, so the ground, planets and ship all draw over the stars
  // (as a transparent object it would be drawn last, over everything).
  sprite.renderOrder = -1;
  sprite.material.transparent = false;
  sprite.material.depthTest = false;
  return sprite;
}
