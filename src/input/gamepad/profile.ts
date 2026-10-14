import type { AxisName, PressAction } from '../bindings';
import type { AxisShape } from './axisShaping';

/** Analog roles a gamepad axis can drive. */
export type AxisRole = AxisName | 'throttle';

export const AXIS_ROLES: readonly AxisRole[] = [
  'pitch',
  'yaw',
  'roll',
  'right',
  'up',
  'forward',
  'throttle',
];

export interface AxisMapping extends AxisShape {
  index: number;
}

export interface GamepadProfile {
  name: string;
  /** USB vendor and product id (hex), matched against the browser's gamepad id. */
  match: { vendor: string; product: string } | null;
  /** Used for unknown controllers that report the browser's standard layout. */
  standardMapping: boolean;
  axes: Partial<Record<AxisRole, AxisMapping>>;
  buttons: Partial<Record<PressAction, number>>;
}

/**
 * Thrustmaster T.Flight HOTAS X on Linux Chromium, from the raw viewer
 * checkpoint on 2026-10-14. Chromium reports: axis 0 stick X (left -1),
 * 1 stick Y (forward -1), 2 throttle lever (forward -1), 3 twist (left -1),
 * 4 rocker (left -1), 5 hat X (left -1), 6 hat Y (forward -1).
 */
export const HOTAS_X_LINUX: GamepadProfile = {
  name: 'Thrustmaster T.Flight HOTAS X',
  match: { vendor: '044f', product: 'b108' },
  standardMapping: false,
  axes: {
    roll: { index: 0, invert: false, deadzone: 0.05, curve: 0.3 },
    pitch: { index: 1, invert: false, deadzone: 0.05, curve: 0.3 }, // pull back = nose up
    throttle: { index: 2, invert: true, deadzone: 0, curve: 0 }, // forward = full
    yaw: { index: 3, invert: false, deadzone: 0.1, curve: 0.3 },
    forward: { index: 4, invert: false, deadzone: 0.1, curve: 0.2 }, // rocker right = forward
    right: { index: 5, invert: false, deadzone: 0, curve: 0 },
    up: { index: 6, invert: true, deadzone: 0, curve: 0 }, // hat forward = up
  },
  buttons: {
    assistKill: 0, // stick trigger: the "panic button" for a tumble
    assistHold: 1,
    assistOff: 3,
    assistRetrograde: 2, // R3
    switchCamera: 4,
    toggleReverse: 5, // throttle button 6
    warpUp: 8, // R2
    warpDown: 9, // L2
    toggleStats: 10, // SE
    pause: 11, // ST
    // 6/7 reserved for hyperdrive.
  },
};

/** Fallback for controllers using the browser's standard (Xbox-style) layout. */
export const GENERIC_STANDARD: GamepadProfile = {
  name: 'Standard gamepad',
  match: null,
  standardMapping: true,
  axes: {
    roll: { index: 0, invert: false, deadzone: 0.1, curve: 0.3 },
    pitch: { index: 1, invert: false, deadzone: 0.1, curve: 0.3 },
    yaw: { index: 2, invert: false, deadzone: 0.1, curve: 0.3 },
    forward: { index: 3, invert: true, deadzone: 0.1, curve: 0.2 },
  },
  buttons: { assistKill: 0, assistHold: 1, assistOff: 3, switchCamera: 4, pause: 9 },
};

export const BUILT_IN_PROFILES: readonly GamepadProfile[] = [HOTAS_X_LINUX, GENERIC_STANDARD];

/** True if the browser's gamepad id names this profile's vendor and product. */
export function profileMatches(
  profile: GamepadProfile,
  gamepad: { id: string; mapping: string },
): boolean {
  if (profile.match) {
    const id = gamepad.id.toLowerCase();
    return (
      id.includes(`vendor: ${profile.match.vendor}`) &&
      id.includes(`product: ${profile.match.product}`)
    );
  }
  return profile.standardMapping && gamepad.mapping === 'standard';
}

/** Picks the first profile for a gamepad: specific matches before the generic fallback. */
export function findProfile(
  profiles: readonly GamepadProfile[],
  gamepad: { id: string; mapping: string },
): GamepadProfile | undefined {
  return (
    profiles.find((p) => p.match !== null && profileMatches(p, gamepad)) ??
    profiles.find((p) => p.match === null && profileMatches(p, gamepad))
  );
}
