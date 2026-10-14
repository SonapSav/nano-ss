import { clampUnit, type ControlState } from '../sim/controls';
import type { GamepadFrame } from './gamepad/gamepadInput';

/**
 * Decides who sets the throttle: the absolute lever or the keyboard ramp.
 * Whichever moved last wins.
 */
export interface ThrottleArbiter {
  /** True while the lever drives the throttle. */
  leverActive: boolean;
  /** Lever position when it last drove the throttle (or when the keyboard took over). */
  lastLever: number | null;
  /** Throttle value after the previous step, to detect keyboard changes. */
  lastApplied: number | null;
}

export function createThrottleArbiter(): ThrottleArbiter {
  return { leverActive: false, lastLever: null, lastApplied: null };
}

/** Lever movement (0..1) that counts as "moved" and takes the throttle back. */
const LEVER_TAKEOVER = 0.01;

/**
 * Adds gamepad input on top of the keyboard values already in `controls`
 * (from `applyKeyboard`). Rotation and translation are summed and clamped.
 */
export function addGamepad(
  controls: ControlState,
  frame: GamepadFrame,
  arbiter: ThrottleArbiter,
): void {
  const { axes } = frame;
  controls.pitch = clampUnit(controls.pitch + (axes.pitch ?? 0));
  controls.yaw = clampUnit(controls.yaw + (axes.yaw ?? 0));
  controls.roll = clampUnit(controls.roll + (axes.roll ?? 0));
  controls.right = clampUnit(controls.right + (axes.right ?? 0));
  controls.up = clampUnit(controls.up + (axes.up ?? 0));
  controls.forward = clampUnit(controls.forward + (axes.forward ?? 0));

  // The keyboard changed the throttle since the last step: it takes over.
  if (arbiter.lastApplied !== null && controls.throttle !== arbiter.lastApplied) {
    arbiter.leverActive = false;
  }

  const lever = axes.throttle;
  if (lever === undefined) {
    arbiter.leverActive = false;
    arbiter.lastLever = null;
  } else {
    if (arbiter.lastLever === null || Math.abs(lever - arbiter.lastLever) > LEVER_TAKEOVER) {
      arbiter.leverActive = true;
    }
    if (arbiter.leverActive) {
      controls.throttle = lever;
      arbiter.lastLever = lever;
    }
  }
  arbiter.lastApplied = controls.throttle;
}
