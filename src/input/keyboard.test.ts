import { describe, expect, it } from 'vitest';
import { createControlState } from '../sim/controls';
import { DEFAULT_BINDINGS, THROTTLE_RATE } from './bindings';
import { KeyboardInput, applyKeyboard } from './keyboard';

const key = (type: string, code: string, repeat = false) =>
  Object.assign(new Event(type, { cancelable: true }), { code, repeat });

describe('applyKeyboard', () => {
  it('maps KSP-style keys to control axes', () => {
    const controls = createControlState();
    applyKeyboard(
      new Set(['KeyS', 'KeyA', 'KeyE', 'KeyI', 'KeyJ', 'KeyH']),
      DEFAULT_BINDINGS,
      controls,
      0,
    );
    expect(controls).toMatchObject({ pitch: 1, yaw: -1, roll: 1, up: 1, right: -1, forward: 1 });

    applyKeyboard(
      new Set(['KeyW', 'KeyD', 'KeyQ', 'KeyK', 'KeyL', 'KeyN']),
      DEFAULT_BINDINGS,
      controls,
      0,
    );
    expect(controls).toMatchObject({ pitch: -1, yaw: 1, roll: -1, up: -1, right: 1, forward: -1 });
  });

  it('cancels opposite keys', () => {
    const controls = createControlState();
    applyKeyboard(new Set(['KeyW', 'KeyS']), DEFAULT_BINDINGS, controls, 0);
    expect(controls.pitch).toBe(0);
  });

  it('ramps the throttle with Shift and Ctrl and clamps it', () => {
    const controls = createControlState();
    applyKeyboard(new Set(['ShiftLeft']), DEFAULT_BINDINGS, controls, 1);
    expect(controls.throttle).toBeCloseTo(THROTTLE_RATE);
    applyKeyboard(new Set(['ShiftLeft']), DEFAULT_BINDINGS, controls, 10);
    expect(controls.throttle).toBe(1);
    applyKeyboard(new Set(['ControlRight']), DEFAULT_BINDINGS, controls, 10);
    expect(controls.throttle).toBe(0);
  });
});

describe('KeyboardInput', () => {
  it('queues press actions once per press, ignoring auto-repeat', () => {
    const target = new EventTarget();
    const input = new KeyboardInput(target, DEFAULT_BINDINGS);
    target.dispatchEvent(key('keydown', 'KeyT'));
    target.dispatchEvent(key('keydown', 'KeyT', true));
    target.dispatchEvent(key('keydown', 'KeyC'));
    expect(input.takeActions()).toEqual(['cycleAssist', 'switchCamera']);
    expect(input.takeActions()).toEqual([]);
  });

  it('clears held keys when the window loses focus', () => {
    const target = new EventTarget();
    const input = new KeyboardInput(target, DEFAULT_BINDINGS);
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(input.held.has('KeyW')).toBe(true);
    target.dispatchEvent(new Event('blur'));
    expect(input.held.size).toBe(0);
  });

  it('ignores unbound keys and leaves them to the browser', () => {
    const target = new EventTarget();
    const input = new KeyboardInput(target, DEFAULT_BINDINGS);
    const event = key('keydown', 'KeyP');
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(input.held.size).toBe(0);
  });
});
