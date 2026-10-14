import { describe, expect, it } from 'vitest';
import { FrameLimiter } from './frameLimiter';

function renders(limiter: FrameLimiter, displayHz: number, seconds: number, jitterMs = 0): number {
  let count = 0;
  for (let i = 0; i < displayHz * seconds; i++) {
    const jitter = jitterMs * Math.sin(i * 12.9898);
    if (limiter.shouldRender((i * 1000) / displayHz + jitter)) count += 1;
  }
  return count;
}

describe('FrameLimiter', () => {
  it('renders about 60 fps on a 144 Hz display', () => {
    expect(Math.abs(renders(new FrameLimiter('cap-60'), 144, 10) - 600)).toBeLessThanOrEqual(2);
  });

  it('renders every frame on a 60 Hz display, even with vsync jitter', () => {
    expect(renders(new FrameLimiter('cap-60'), 60, 10, 1)).toBe(600);
  });

  it('renders every refresh in display mode', () => {
    expect(renders(new FrameLimiter('display'), 144, 10)).toBe(1440);
  });

  it('restarts the schedule after a stall instead of bursting', () => {
    const limiter = new FrameLimiter('cap-60');
    expect(limiter.shouldRender(0)).toBe(true);
    expect(limiter.shouldRender(5000)).toBe(true);
    expect(limiter.shouldRender(5007)).toBe(false);
  });
});
