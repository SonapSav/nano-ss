import { Quaternion, Vector3 } from 'three/webgpu';
import { clampUnit, type AssistMode, type ControlState } from './controls';
import {
  pilotRotationToBody,
  pilotTranslationToBody,
  shipInertia,
  shipMass,
  type EngineCommand,
  type RcsCommand,
  type Ship,
} from './ship';

/**
 * Everything automatic about flying, on top of the pilot's commands.
 *
 * Attitude modes (rotation only, through the RCS):
 * - off: pilot commands go straight to the thrusters;
 * - kill-rotation: axes without pilot input are damped to zero rate;
 * - hold-attitude: holds the orientation captured when the pilot let go;
 * - prograde / retrograde: points the nose along / against the velocity (D-041).
 *
 * Flight assist (FA, a game assist, D-041/D-044): when on, sideways and
 * up/down drift is cancelled with the RCS, and with the throttle at 0 and no
 * forward/back input the ship brakes to a stop with the retro or main engine.
 */
export interface FlightComputer {
  mode: AssistMode;
  /** Orientation being held in hold-attitude mode; null until captured. */
  holdTarget: Quaternion | null;
  /** Flight assist: drift cancelling and automatic braking. */
  fa: boolean;
}

export interface FlightCommands {
  rcs: RcsCommand;
  engines: EngineCommand;
}

/** Time constant for rate corrections, in s. */
const RATE_RESPONSE = 0.3;
/** Rates below this are left alone, to avoid thruster chatter (rad/s). */
const RATE_DEADBAND = 1e-4;
/** Attitude approach: rate per radian of error near the target (1/s), and the rate limit (rad/s). */
const HOLD_GAIN = 1.5;
const HOLD_MAX_RATE = 0.35;
/** Share of the ship's angular acceleration planned for, so the approach never overshoots. */
const BRAKING_MARGIN = 0.8;
/** Below this speed prograde and retrograde have no direction and act as hold attitude (m/s). */
const MIN_DIRECTION_SPEED = 0.1;
const INPUT_THRESHOLD = 0.01;

/** FA: drift time constant (s), engine braking time constant (s), and switch-over to RCS (m/s). */
const FA_DRIFT_RESPONSE = 1;
const FA_BRAKE_RESPONSE = 2;
const FA_RCS_SPEED = 0.3;
const FA_DEADBAND = 0.005;

export function createFlightComputer(mode: AssistMode = 'off', fa = true): FlightComputer {
  return { mode, holdTarget: null, fa };
}

export function setAssistMode(fc: FlightComputer, mode: AssistMode): void {
  fc.mode = mode;
  fc.holdTarget = null;
}

export function createFlightCommands(): FlightCommands {
  return {
    rcs: { rotation: new Vector3(), translation: new Vector3() },
    engines: { main: 0, retro: 0 },
  };
}

const _pilot = new Vector3();
const _desired = new Vector3();
const _error = new Quaternion();
const _target = new Quaternion();
const _turn = new Quaternion();
const _nose = new Vector3();
const _direction = new Vector3();
const _vBody = new Vector3();
const _inverse = new Quaternion();

/** Body-frame rotation vector (axis × angle, rad) from the current orientation to `target`. */
function attitudeError(current: Quaternion, target: Quaternion, out: Vector3): Vector3 {
  _error.copy(current).invert().multiply(target);
  if (_error.w < 0) _error.set(-_error.x, -_error.y, -_error.z, -_error.w);
  const s = Math.sqrt(_error.x * _error.x + _error.y * _error.y + _error.z * _error.z);
  if (s < 1e-12) return out.set(0, 0, 0);
  const angle = 2 * Math.atan2(s, _error.w);
  return out.set(_error.x, _error.y, _error.z).multiplyScalar(angle / s);
}

/** Orientation that points the nose (-Z) along `direction` with the smallest turn (keeps roll). */
function noseAlong(current: Quaternion, direction: Vector3, out: Quaternion): Quaternion {
  _nose.set(0, 0, -1).applyQuaternion(current);
  _turn.setFromUnitVectors(_nose, direction);
  return out.copy(_turn).multiply(current);
}

export function computeCommands(
  fc: FlightComputer,
  ship: Ship,
  controls: ControlState,
  out: FlightCommands,
): FlightCommands {
  const { rcs, engines } = out;
  const body = ship.body;
  pilotTranslationToBody(controls, rcs.translation);
  engines.main = controls.reverse ? 0 : controls.throttle;
  engines.retro = controls.reverse ? controls.throttle : 0;

  computeRotation(fc, ship, controls, rcs.rotation);

  if (fc.fa) {
    const mass = shipMass(ship);
    const rcsAccel = ship.config.rcs.force / mass;
    _vBody.copy(body.velocity).applyQuaternion(_inverse.copy(body.orientation).invert());
    const cancel = (v: number) =>
      Math.abs(v) < FA_DEADBAND ? 0 : clampUnit(-v / (FA_DRIFT_RESPONSE * rcsAccel));

    if (Math.abs(controls.right) < INPUT_THRESHOLD) rcs.translation.x = cancel(_vBody.x);
    if (Math.abs(controls.up) < INPUT_THRESHOLD) rcs.translation.y = cancel(_vBody.y);

    if (controls.throttle === 0 && Math.abs(controls.forward) < INPUT_THRESHOLD) {
      const forwardSpeed = -_vBody.z;
      if (forwardSpeed > FA_RCS_SPEED) {
        const a = ship.config.retroEngine.thrust / mass;
        engines.retro = Math.min(1, forwardSpeed / (FA_BRAKE_RESPONSE * a));
      } else if (forwardSpeed < -FA_RCS_SPEED) {
        const a = ship.config.mainEngine.thrust / mass;
        engines.main = Math.min(1, -forwardSpeed / (FA_BRAKE_RESPONSE * a));
      } else {
        rcs.translation.z = cancel(_vBody.z);
      }
    }
  }
  return out;
}

function computeRotation(
  fc: FlightComputer,
  ship: Ship,
  controls: ControlState,
  out: Vector3,
): void {
  const pilot = pilotRotationToBody(controls, _pilot);
  if (fc.mode === 'off') {
    out.copy(pilot);
    return;
  }

  const body = ship.body;
  const hasInput =
    Math.abs(pilot.x) > INPUT_THRESHOLD ||
    Math.abs(pilot.y) > INPUT_THRESHOLD ||
    Math.abs(pilot.z) > INPUT_THRESHOLD;

  // Which orientation to aim for, if any.
  let target: Quaternion | null = null;
  const speed = body.velocity.length();
  if ((fc.mode === 'prograde' || fc.mode === 'retrograde') && speed > MIN_DIRECTION_SPEED) {
    _direction.copy(body.velocity).divideScalar(fc.mode === 'prograde' ? speed : -speed);
    target = noseAlong(body.orientation, _direction, _target);
    fc.holdTarget = null;
  } else if (fc.mode !== 'kill-rotation') {
    if (hasInput) fc.holdTarget = null;
    else fc.holdTarget ??= body.orientation.clone();
    target = fc.holdTarget;
  }

  const inertia = shipInertia(ship.config, shipMass(ship));
  const torque = ship.config.rcs.torque;
  _desired.set(0, 0, 0);
  if (target) {
    const error = attitudeError(body.orientation, target, _direction);
    const rate = (e: number, alpha: number) =>
      Math.sign(e) *
      Math.min(
        HOLD_MAX_RATE,
        HOLD_GAIN * Math.abs(e),
        Math.sqrt(2 * BRAKING_MARGIN * alpha * Math.abs(e)),
      );
    _desired.set(
      rate(error.x, torque.x / inertia.x),
      rate(error.y, torque.y / inertia.y),
      rate(error.z, torque.z / inertia.z),
    );
  }

  const w = body.angularVelocity;
  const correct = (axis: 'x' | 'y' | 'z', moment: number, maxTorque: number): number => {
    if (Math.abs(pilot[axis]) > INPUT_THRESHOLD) return pilot[axis];
    const rateError = _desired[axis] - w[axis];
    if (!target && Math.abs(rateError) < RATE_DEADBAND) return 0;
    return clampUnit((moment * rateError) / (RATE_RESPONSE * maxTorque));
  };
  out.set(
    correct('x', inertia.x, torque.x),
    correct('y', inertia.y, torque.y),
    correct('z', inertia.z, torque.z),
  );
}
