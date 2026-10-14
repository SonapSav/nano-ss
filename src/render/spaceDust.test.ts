import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { wrapDust } from './spaceDust';

describe('wrapDust', () => {
  it('keeps every speck inside the cube around the ship', () => {
    const out = new Vector3();
    for (const ship of [
      new Vector3(0, 0, 0),
      new Vector3(1e9, -3e8, 7.5e10),
      new Vector3(-55, 12, 99),
    ]) {
      wrapDust(new Vector3(17, 150, 3), ship, 160, out);
      for (const v of out.toArray()) {
        expect(v).toBeGreaterThanOrEqual(-80);
        expect(v).toBeLessThan(80);
      }
    }
  });

  it('moves opposite to the ship, so specks drift past as it moves', () => {
    const seed = new Vector3(50, 80, 80);
    const before = wrapDust(seed, new Vector3(0, 0, 0), 160, new Vector3());
    const after = wrapDust(seed, new Vector3(10, 0, 0), 160, new Vector3());
    expect(after.x - before.x).toBeCloseTo(-10, 9);
  });
});
