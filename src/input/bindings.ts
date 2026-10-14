/**
 * Default keyboard bindings, KSP-style (chosen 2026-10-14), as data so they
 * can become rebindable in Stage 2. Keys are `KeyboardEvent.code` values, so
 * they refer to physical key positions and work on any keyboard layout.
 */

export type AxisName = 'pitch' | 'yaw' | 'roll' | 'right' | 'up' | 'forward';

export interface AxisBinding {
  axis: AxisName;
  positive: string;
  negative: string;
}

/** Actions that fire once per key press. */
export type PressAction =
  | 'throttleFull'
  | 'throttleCut'
  | 'cycleAssist'
  | 'switchCamera'
  | 'pause'
  | 'toggleStats'
  | 'fullscreen';

/** Actions that act continuously while held. */
export type HoldAction = 'throttleUp' | 'throttleDown';

export interface Bindings {
  axes: readonly AxisBinding[];
  hold: Readonly<Record<HoldAction, readonly string[]>>;
  press: Readonly<Record<PressAction, readonly string[]>>;
}

export const DEFAULT_BINDINGS: Bindings = {
  axes: [
    { axis: 'pitch', positive: 'KeyS', negative: 'KeyW' }, // S nose up, W nose down
    { axis: 'yaw', positive: 'KeyD', negative: 'KeyA' },
    { axis: 'roll', positive: 'KeyE', negative: 'KeyQ' },
    { axis: 'up', positive: 'KeyI', negative: 'KeyK' },
    { axis: 'right', positive: 'KeyL', negative: 'KeyJ' },
    { axis: 'forward', positive: 'KeyH', negative: 'KeyN' },
  ],
  hold: {
    throttleUp: ['ShiftLeft', 'ShiftRight'],
    throttleDown: ['ControlLeft', 'ControlRight'],
  },
  press: {
    throttleFull: ['KeyZ'],
    throttleCut: ['KeyX'],
    cycleAssist: ['KeyT'],
    switchCamera: ['KeyC'],
    pause: ['Escape'],
    toggleStats: ['F3'],
    fullscreen: ['KeyF'],
  },
};

/** Throttle change per second while Shift or Ctrl is held. */
export const THROTTLE_RATE = 0.5;

/** Every key code used by the bindings (the page takes these over from the browser). */
export function boundCodes(bindings: Bindings): Set<string> {
  const codes = new Set<string>();
  for (const a of bindings.axes) codes.add(a.positive).add(a.negative);
  for (const list of Object.values(bindings.hold)) for (const c of list) codes.add(c);
  for (const list of Object.values(bindings.press)) for (const c of list) codes.add(c);
  return codes;
}
