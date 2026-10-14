import { describe, expect, it } from 'vitest';
import { computeWorkerCount, workerOverrideFromUrl } from './workerBudget';

describe('computeWorkerCount', () => {
  it('is limited by threads on the 32 GB dev machine', () => {
    expect(computeWorkerCount({ threads: 12, memoryGB: 32, perWorkerMB: 512 })).toBe(10);
  });

  it('is limited by memory on a 16 GB machine', () => {
    expect(computeWorkerCount({ threads: 12, memoryGB: 16, perWorkerMB: 512 })).toBe(8);
  });

  it("respects Chromium's 8 GB deviceMemory cap", () => {
    expect(computeWorkerCount({ threads: 12, memoryGB: 8, perWorkerMB: 512 })).toBe(4);
  });

  it('falls back to threads when memory is unknown', () => {
    expect(computeWorkerCount({ threads: 12, memoryGB: undefined, perWorkerMB: 512 })).toBe(10);
  });

  it('never returns fewer than one worker', () => {
    expect(computeWorkerCount({ threads: 1, memoryGB: 0.5, perWorkerMB: 4096 })).toBe(1);
    expect(computeWorkerCount({ threads: 12, memoryGB: 32, perWorkerMB: 512, override: 0 })).toBe(
      1,
    );
  });

  it('uses the override when set', () => {
    expect(computeWorkerCount({ threads: 12, memoryGB: 32, perWorkerMB: 512, override: 3 })).toBe(
      3,
    );
  });
});

describe('workerOverrideFromUrl', () => {
  it('reads ?workers=N', () => {
    expect(workerOverrideFromUrl('?workers=4')).toBe(4);
  });

  it('ignores missing or invalid values', () => {
    expect(workerOverrideFromUrl('')).toBeUndefined();
    expect(workerOverrideFromUrl('?workers=lots')).toBeUndefined();
  });
});
