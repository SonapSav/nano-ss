import { Color } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { starAppearance, starColor } from './starfield';

describe('star appearance', () => {
  it('makes brighter stars (lower magnitude) bigger and brighter, within limits', () => {
    const sirius = starAppearance(-1.46);
    const polaris = starAppearance(1.98);
    const faint = starAppearance(6.5);
    expect(sirius.brightness).toBeGreaterThan(polaris.brightness);
    expect(polaris.brightness).toBeGreaterThan(faint.brightness);
    expect(sirius.size).toBeGreaterThan(faint.size);
    expect(sirius.brightness).toBeLessThanOrEqual(1);
    expect(faint.size).toBeGreaterThanOrEqual(1.2);
  });

  it('colours hot stars blue-white and cool stars orange', () => {
    const hot = starColor(-0.3, new Color());
    const cool = starColor(1.7, new Color());
    expect(hot.b).toBeGreaterThan(hot.r * 0.95);
    expect(cool.r).toBeGreaterThan(cool.b);
  });
});
