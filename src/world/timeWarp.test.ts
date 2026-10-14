import { describe, expect, it } from 'vitest';
import { EARTH } from './bodies';
import { TimeWarp, maxSubstep, warpDrop, type WarpConditions } from './timeWarp';

const calm: WarpConditions = {
  factor: 1000,
  altitude: 400_000,
  safeAltitude: 150_000,
  periapsisAltitude: 399_000,
  timeToPeriapsis: 2000,
  enteredTargetZone: false,
  referenceChanged: false,
  controlInput: false,
};

describe('TimeWarp', () => {
  it('steps through 1, 2, 4, 10, 100, 1000 and stops at the ends', () => {
    const warp = new TimeWarp();
    const seen = [warp.factor];
    for (let i = 0; i < 7; i++) {
      warp.up();
      seen.push(warp.factor);
    }
    expect(seen).toEqual([1, 2, 4, 10, 100, 1000, 1000, 1000]);
    warp.down();
    expect(warp.factor).toBe(100);
    expect(warp.coasting).toBe(true);
    warp.limit(4);
    expect(warp.factor).toBe(4);
    expect(warp.coasting).toBe(false);
  });
});

describe('warpDrop', () => {
  it('keeps warp in a calm orbit', () => {
    expect(warpDrop(calm)).toBeNull();
  });

  it('drops to 1× when entering the target zone or changing sphere of influence', () => {
    expect(warpDrop({ ...calm, enteredTargetZone: true })).toEqual({ reason: 'target', factor: 1 });
    expect(warpDrop({ ...calm, referenceChanged: true })).toEqual({
      reason: 'sphere-of-influence',
      factor: 1,
    });
  });

  it('drops to 1× before a low pass, but not for a distant one', () => {
    expect(warpDrop({ ...calm, periapsisAltitude: 120_000, timeToPeriapsis: 2000 })).toEqual({
      reason: 'low-orbit',
      factor: 1,
    });
    expect(
      warpDrop({ ...calm, factor: 10, periapsisAltitude: 120_000, timeToPeriapsis: 2000 }),
    ).toBeNull();
    expect(warpDrop({ ...calm, altitude: 140_000 })?.reason).toBe('low-orbit');
  });

  it('reduces to 4× on control input while coasting, and ignores input at controlled levels', () => {
    expect(warpDrop({ ...calm, controlInput: true })).toEqual({
      reason: 'control-input',
      factor: 4,
    });
    expect(warpDrop({ ...calm, factor: 4, controlInput: true })).toBeNull();
  });
});

describe('maxSubstep', () => {
  it('allows about 11 s in low Earth orbit and more far out', () => {
    expect(maxSubstep([{ distance: EARTH.radius + 400_000, gm: EARTH.gm }])).toBeCloseTo(11, 0);
    expect(maxSubstep([{ distance: 3.8e8, gm: EARTH.gm }])).toBeGreaterThan(1000);
  });
});
