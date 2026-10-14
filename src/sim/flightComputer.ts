import { Quaternion, Vector3 } from 'three/webgpu';
import { clampUnit, type AssistMode, type ControlState } from './controls';
import {
  pilotRotationToBody,
  pilotTranslationToBody,
  shipInertia,
  shipMass,
  type RcsCommand,
  type Ship,
} from './ship';

/**
 * Rotation assistance a real spacecraft has, flown with the RCS only (D-004):
 * - off: pilot commands go straight to the thrusters;
 * - kill-rotation: axes without pilot input are damped to zero rate;
 * - hold-attitude: with no rotation input, holds the orientation captured
 *   when the pilot let go.
 * Translation is never automated: there is no velocity cancelling.
 */
export interface FlightComputer {
  mode: AssistMode;
  /** Orientation being held in hold-attitude mode; null until captured. */
  holdTarget: Quaternion | null;
}

/** Time constant for rate corrections, in s. */
const RATE_RESPONSE = 0.5;
/** Rates below this are left alone, to avoid thruster chatter (rad/s). */
const RATE_DEADBAND = 1e-4;
/** Hold attitude: corrective rate per radian of error (1/s), and its limit (rad/s). */
const HOLD_GAIN = 1;
const HOLD_MAX_RATE = 0.1;
const INPUT_THRESHOLD = 0.01;

export function createFlightComputer(mode: AssistMode = 'off'): FlightComputer {
  return { mode, holdTarget: null };
}

export function setAssistMode(fc: FlightComputer, mode: AssistMode): void {
  fc.mode = mode;
  fc.holdTarget = null;
}

const _pilot = new Vector3();
const _desired = new Vector3();
const _error = new Quaternion();

/** Turns pilot controls into the RCS command for this step. */
export function computeRcs(
  fc: FlightComputer,
  ship: Ship,
  controls: ControlState,
  out: RcsCommand,
): RcsCommand {
  pilotTranslationToBody(controls, out.translation);
  const pilot = pilotRotationToBody(controls, _pilot);
  const hasInput =
    Math.abs(pilot.x) > INPUT_THRESHOLD ||
    Math.abs(pilot.y) > INPUT_THRESHOLD ||
    Math.abs(pilot.z) > INPUT_THRESHOLD;

  if (fc.mode === 'off') {
    out.rotation.copy(pilot);
    return out;
  }

  const w = ship.body.angularVelocity;
  _desired.set(0, 0, 0);

  if (fc.mode === 'hold-attitude') {
    if (hasInput) {
      fc.holdTarget = null;
    } else {
      fc.holdTarget ??= ship.body.orientation.clone();
      // Body-frame error rotation from the current orientation to the target.
      _error.copy(ship.body.orientation).invert().multiply(fc.holdTarget);
      if (_error.w < 0) _error.set(-_error.x, -_error.y, -_error.z, -_error.w);
      const clampRate = (v: number) => Math.max(-HOLD_MAX_RATE, Math.min(HOLD_MAX_RATE, v));
      _desired.set(
        clampRate(2 * _error.x * HOLD_GAIN),
        clampRate(2 * _error.y * HOLD_GAIN),
        clampRate(2 * _error.z * HOLD_GAIN),
      );
    }
  }

  const inertia = shipInertia(ship.config, shipMass(ship));
  const torque = ship.config.rcs.torque;
  const correct = (axis: 'x' | 'y' | 'z', moment: number, maxTorque: number): number => {
    if (Math.abs(pilot[axis]) > INPUT_THRESHOLD) return pilot[axis];
    const rateError = _desired[axis] - w[axis];
    if (fc.mode === 'kill-rotation' && Math.abs(rateError) < RATE_DEADBAND) return 0;
    return clampUnit((moment * rateError) / (RATE_RESPONSE * maxTorque));
  };

  out.rotation.set(
    correct('x', inertia.x, torque.x),
    correct('y', inertia.y, torque.y),
    correct('z', inertia.z, torque.z),
  );
  return out;
}
