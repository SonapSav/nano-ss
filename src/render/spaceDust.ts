import { Vector3 } from 'three/webgpu';
import { createPointCloud } from './pointCloud';

/** Side of the cube of dust kept around the ship (m). */
export const DUST_CELL = 160;

/**
 * Wraps a fixed dust position into the cube centred on the ship, in render
 * space (ship at the origin). Done in 64-bit, so it works at any distance.
 */
export function wrapDust(
  seed: Vector3,
  shipPosition: Vector3,
  cell: number,
  out: Vector3,
): Vector3 {
  const wrap = (v: number) => (((v % cell) + cell) % cell) - cell / 2;
  return out.set(
    wrap(seed.x - shipPosition.x),
    wrap(seed.y - shipPosition.y),
    wrap(seed.z - shipPosition.z),
  );
}

/**
 * Faint specks drifting past the ship, so slow translation and drift are
 * visible. Space has no such dust: this is a motion reference, switchable in
 * settings.
 */
export function createSpaceDust(count = 700, seed = 7) {
  let a = seed;
  const random = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  const seeds = Array.from(
    { length: count },
    () => new Vector3(random() * DUST_CELL, random() * DUST_CELL, random() * DUST_CELL),
  );
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3).fill(0.35);
  const sizes = new Float32Array(count).fill(1.5);
  const { sprite, positionAttribute } = createPointCloud(positions, colors, sizes, {
    dynamic: true,
  });
  const p = new Vector3();

  return {
    sprite,
    update(shipPosition: Vector3) {
      seeds.forEach((s, i) => {
        wrapDust(s, shipPosition, DUST_CELL, p);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      });
      positionAttribute.needsUpdate = true;
    },
  };
}
