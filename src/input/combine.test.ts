import { describe, expect, it } from 'vitest';
import { createControlState } from '../sim/controls';
import { addGamepad, createThrottleArbiter } from './combine';

describe('addGamepad', () => {
  it('sums keyboard and gamepad axes and clamps them', () => {
    const controls = { ...createControlState(), pitch: 1, roll: -1 };
    addGamepad(
      controls,
      { device: 'x', axes: { pitch: 0.5, roll: 0.25, yaw: -0.3 } },
      createThrottleArbiter(),
    );
    expect(controls.pitch).toBe(1);
    expect(controls.roll).toBe(-0.75);
    expect(controls.yaw).toBe(-0.3);
  });

  it('lets the lever set the throttle, then the keyboard, then the lever again', () => {
    const controls = createControlState();
    const arbiter = createThrottleArbiter();
    const step = (lever: number) => {
      addGamepad(controls, { device: 'x', axes: { throttle: lever } }, arbiter);
    };

    step(0.4);
    expect(controls.throttle).toBe(0.4);
    step(0.405); // small, smooth lever motion is followed while the lever is in charge
    expect(controls.throttle).toBe(0.405);

    controls.throttle = 1; // keyboard Z
    step(0.405);
    expect(controls.throttle).toBe(1); // lever unchanged: keyboard value stays

    step(0.3); // lever moved: it takes over again
    expect(controls.throttle).toBe(0.3);
  });

  it('keeps the keyboard throttle when no lever is present', () => {
    const controls = { ...createControlState(), throttle: 0.6 };
    addGamepad(controls, { device: null, axes: {} }, createThrottleArbiter());
    expect(controls.throttle).toBe(0.6);
  });
});
