import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THROTTLE_CALIBRATION,
  expandCalibration,
  shapeAxis,
  throttleFromAxis,
} from './axisShaping';

const linear = { invert: false, deadzone: 0, curve: 0 };

describe('shapeAxis', () => {
  it('returns 0 inside the dead zone and is continuous at its edge', () => {
    const shape = { ...linear, deadzone: 0.1 };
    expect(shapeAxis(0.05, shape)).toBe(0);
    expect(shapeAxis(-0.1, shape)).toBe(0);
    expect(shapeAxis(0.1001, shape)).toBeCloseTo(0, 3);
  });

  it('still reaches full deflection with a dead zone and a curve', () => {
    const shape = { invert: false, deadzone: 0.1, curve: 0.5 };
    expect(shapeAxis(1, shape)).toBe(1);
    expect(shapeAxis(-1, shape)).toBe(-1);
  });

  it('gives finer control near centre with a curve, keeping the sign', () => {
    const curved = shapeAxis(0.3, { ...linear, curve: 0.5 });
    expect(curved).toBeGreaterThan(0);
    expect(curved).toBeLessThan(0.3);
    expect(shapeAxis(-0.3, { ...linear, curve: 0.5 })).toBeCloseTo(-curved, 12);
  });

  it('inverts', () => {
    expect(shapeAxis(0.5, { ...linear, invert: true })).toBe(-0.5);
  });
});

describe('throttleFromAxis', () => {
  it('maps the HOTAS X lever (forward = -1) to 0..1', () => {
    expect(throttleFromAxis(1, true, DEFAULT_THROTTLE_CALIBRATION)).toBe(0); // pulled back
    expect(throttleFromAxis(-1, true, DEFAULT_THROTTLE_CALIBRATION)).toBe(1); // full forward
    expect(throttleFromAxis(0, true, DEFAULT_THROTTLE_CALIBRATION)).toBeCloseTo(0.5, 6);
  });

  it('snaps the last bit of travel to exactly 0 % and 100 %', () => {
    expect(throttleFromAxis(-0.97, true, DEFAULT_THROTTLE_CALIBRATION)).toBe(1);
    expect(throttleFromAxis(0.97, true, DEFAULT_THROTTLE_CALIBRATION)).toBe(0);
  });

  it('uses a calibrated range, which expands when the lever goes further', () => {
    let cal = { min: -0.8, max: 0.8 };
    expect(throttleFromAxis(-0.8, false, cal)).toBe(0);
    expect(throttleFromAxis(0.8, false, cal)).toBe(1);
    cal = expandCalibration(cal, 0.9, false);
    expect(cal).toEqual({ min: -0.8, max: 0.9 });
    expect(throttleFromAxis(0.8, false, cal)).toBeLessThan(1);
  });
});
