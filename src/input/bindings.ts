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
  | 'assistKill'
  | 'assistHold'
  | 'assistOff'
  | 'assistPrograde'
  | 'assistRetrograde'
  | 'toggleFlightAssist'
  | 'toggleReverse'
  | 'switchCamera'
  | 'pause'
  | 'toggleStats'
  | 'fullscreen'
  | 'resetShip';

export const PRESS_ACTIONS: readonly PressAction[] = [
  'throttleFull',
  'throttleCut',
  'cycleAssist',
  'assistKill',
  'assistHold',
  'assistOff',
  'assistPrograde',
  'assistRetrograde',
  'toggleFlightAssist',
  'toggleReverse',
  'switchCamera',
  'pause',
  'toggleStats',
  'fullscreen',
  'resetShip',
];

export const PRESS_ACTION_LABELS: Record<PressAction, string> = {
  throttleFull: 'Full throttle',
  throttleCut: 'Cut throttle',
  cycleAssist: 'Cycle assist mode',
  assistKill: 'Assist: kill rotation',
  assistHold: 'Assist: hold attitude',
  assistOff: 'Assist: off',
  assistPrograde: 'Assist: prograde hold',
  assistRetrograde: 'Assist: retrograde hold',
  toggleFlightAssist: 'Flight assist (FA) on/off',
  toggleReverse: 'Reverse (retro engines) on/off',
  switchCamera: 'Switch camera',
  pause: 'Pause and settings',
  toggleStats: 'Performance overlay',
  fullscreen: 'Fullscreen',
  resetShip: 'Reset ship (refuel, back to start)',
};

export const AXIS_LABELS: Record<AxisName, [string, string]> = {
  pitch: ['Pitch up', 'Pitch down'],
  yaw: ['Yaw right', 'Yaw left'],
  roll: ['Roll right', 'Roll left'],
  right: ['Translate right', 'Translate left'],
  up: ['Translate up', 'Translate down'],
  forward: ['Translate forward', 'Translate back'],
};

/** Actions that act continuously while held. */
export type HoldAction = 'throttleUp' | 'throttleDown';

export interface Bindings {
  axes: AxisBinding[];
  hold: Record<HoldAction, string[]>;
  press: Record<PressAction, string[]>;
}

/** Defaults; use `defaultBindings()` for a copy that can be edited. */
export const DEFAULT_BINDINGS: Readonly<Bindings> = {
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
    assistKill: [],
    assistHold: [],
    assistOff: [],
    assistPrograde: ['KeyG'],
    assistRetrograde: ['KeyV'],
    toggleFlightAssist: ['KeyY'],
    toggleReverse: ['KeyB'],
    switchCamera: ['KeyC'],
    pause: ['Escape'],
    toggleStats: ['F3'],
    fullscreen: ['KeyF'],
    resetShip: ['KeyR'],
  },
};

export function defaultBindings(): Bindings {
  return structuredClone(DEFAULT_BINDINGS);
}

/** Throttle change per second while Shift or Ctrl is held. */
export const THROTTLE_RATE = 0.5;

/** Every key code used by the bindings (the page takes these over from the browser). */
export function boundCodes(bindings: Readonly<Bindings>): Set<string> {
  const codes = new Set<string>();
  for (const a of bindings.axes) codes.add(a.positive).add(a.negative);
  for (const list of Object.values(bindings.hold)) for (const c of list) codes.add(c);
  for (const list of Object.values(bindings.press)) for (const c of list) codes.add(c);
  return codes;
}
