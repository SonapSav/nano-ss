import { describe, expect, it } from 'vitest';
import { SimClock, gmstRadians, julianDateFromUnixMs } from './time';

describe('time', () => {
  it('converts Unix time to Julian date', () => {
    expect(julianDateFromUnixMs(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(2451545.0, 9);
  });

  it('gives Meeus example 12.a sidereal time (1987 April 10, 0h UT: 13h10m46.3668s)', () => {
    const hours = (gmstRadians(2446895.5) * 12) / Math.PI;
    expect(hours).toBeCloseTo(13 + 10 / 60 + 46.3668 / 3600, 5);
  });

  it('advances the clock in simulated seconds', () => {
    const clock = new SimClock(2461327.5);
    clock.seconds += 43_200;
    expect(clock.jd).toBeCloseTo(2461328.0, 9);
    expect(clock.date.toISOString()).toBe('2026-10-14T12:00:00.000Z');
  });
});
