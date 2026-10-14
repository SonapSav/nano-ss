import { describe, expect, it } from 'vitest';
import { duration, formatDistance, formatSpeed } from './hud';

describe('HUD formatting', () => {
  it('formats durations compactly', () => {
    expect(duration(45)).toBe('45 s');
    expect(duration(750)).toBe('12m 30s');
    expect(duration(5544)).toBe('1h 32m');
    expect(duration(3 * 86_400 + 4 * 3600)).toBe('3d 04h');
    expect(duration(NaN)).toBe('—');
  });

  it('switches to km above 1000', () => {
    expect(formatSpeed(7670)).toBe('7.67 km/s');
    expect(formatDistance(2000)).toBe('2.00 km');
    expect(formatDistance(350)).toBe('350 m');
  });
});
