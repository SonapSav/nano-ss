import { Vector3 } from 'three/webgpu';
import type { ControlState } from './controls';
import { createBodyState, integrateBody, type BodyState, type Inertia } from './rigidBody';

/** Standard gravity, for converting specific impulse to exhaust velocity. */
export const G0 = 9.80665;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ShipConfig {
  name: string;
  /** Box used to estimate the inertia tensor, in m (X width, Y height, Z length). */
  inertiaBox: { width: number; height: number; length: number };
  dryMass: number;
  mainPropellantCapacity: number;
  rcsPropellantCapacity: number;
  /** Thrust in N along the -Z (forward) body axis; Isp in s. */
  mainEngine: { thrust: number; isp: number };
  rcs: {
    /** Translation force per axis, in N. */
    force: number;
    /** Maximum torque about each body axis, in N·m. */
    torque: Vec3Like;
    /** Thruster distance from the centre of mass per axis, in m (for propellant use). */
    leverArm: Vec3Like;
    isp: number;
  };
}

/** Normalized RCS commands actually sent to the thrusters, -1 to 1 per axis. */
export interface RcsCommand {
  rotation: Vector3;
  translation: Vector3;
}

export interface Ship {
  config: ShipConfig;
  body: BodyState;
  mainPropellant: number;
  rcsPropellant: number;
  /** Throttle actually applied in the last step (0 when out of propellant). */
  appliedThrottle: number;
  /** RCS command applied in the last step (zero when out of propellant). */
  appliedRcs: RcsCommand;
}

export function createShip(config: ShipConfig): Ship {
  return {
    config,
    body: createBodyState(),
    mainPropellant: config.mainPropellantCapacity,
    rcsPropellant: config.rcsPropellantCapacity,
    appliedThrottle: 0,
    appliedRcs: { rotation: new Vector3(), translation: new Vector3() },
  };
}

/** Refills both tanks and puts the ship back at the start, at rest (temporary, D-039). */
export function resetShip(ship: Ship): void {
  const fresh = createShip(ship.config);
  ship.body.position.copy(fresh.body.position);
  ship.body.velocity.copy(fresh.body.velocity);
  ship.body.orientation.copy(fresh.body.orientation);
  ship.body.angularVelocity.copy(fresh.body.angularVelocity);
  ship.mainPropellant = fresh.mainPropellant;
  ship.rcsPropellant = fresh.rcsPropellant;
  ship.appliedThrottle = 0;
  ship.appliedRcs.rotation.set(0, 0, 0);
  ship.appliedRcs.translation.set(0, 0, 0);
}

export function shipMass(ship: Ship): number {
  return ship.config.dryMass + ship.mainPropellant + ship.rcsPropellant;
}

/** Inertia of a uniform box of the given mass (propellant spread through the hull). */
export function shipInertia(config: ShipConfig, mass: number): Inertia {
  const { width: w, height: h, length: l } = config.inertiaBox;
  return {
    x: (mass / 12) * (h * h + l * l),
    y: (mass / 12) * (w * w + l * l),
    z: (mass / 12) * (w * w + h * h),
  };
}

/** Remaining delta-v of the main engine (Tsiolkovsky), in m/s. */
export function mainDeltaV(ship: Ship): number {
  const full = shipMass(ship);
  const empty = full - ship.mainPropellant;
  return ship.config.mainEngine.isp * G0 * Math.log(full / empty);
}

/** Maps pilot rotation (pitch/yaw/roll) to normalized body-axis torque commands. */
export function pilotRotationToBody(controls: ControlState, out: Vector3): Vector3 {
  return out.set(controls.pitch, -controls.yaw, -controls.roll);
}

/** Maps pilot translation (right/up/forward) to normalized body-axis force commands. */
export function pilotTranslationToBody(controls: ControlState, out: Vector3): Vector3 {
  return out.set(controls.right, controls.up, -controls.forward);
}

const _force = new Vector3();
const _torque = new Vector3();

/**
 * Applies engine and RCS commands for `dt` seconds: consumes propellant,
 * then integrates the body using the mass at the middle of the step.
 */
export function stepShip(ship: Ship, throttle: number, rcs: RcsCommand, dt: number): void {
  const { mainEngine, rcs: rcsConfig } = ship.config;

  // Main engine: mass flow = thrust / (Isp·g0).
  let mainBurn = ((throttle * mainEngine.thrust) / (mainEngine.isp * G0)) * dt;
  let mainFraction = throttle;
  if (mainBurn > ship.mainPropellant) {
    mainFraction = mainBurn > 0 ? (throttle * ship.mainPropellant) / mainBurn : 0;
    mainBurn = ship.mainPropellant;
  }

  // RCS: translation thrust plus the thrust needed for each torque via its lever arm.
  const rot = rcs.rotation;
  const tr = rcs.translation;
  const rcsThrust =
    rcsConfig.force * (Math.abs(tr.x) + Math.abs(tr.y) + Math.abs(tr.z)) +
    Math.abs(rot.x * rcsConfig.torque.x) / rcsConfig.leverArm.x +
    Math.abs(rot.y * rcsConfig.torque.y) / rcsConfig.leverArm.y +
    Math.abs(rot.z * rcsConfig.torque.z) / rcsConfig.leverArm.z;
  let rcsBurn = (rcsThrust / (rcsConfig.isp * G0)) * dt;
  let rcsFraction = 1;
  if (rcsBurn > ship.rcsPropellant) {
    rcsFraction = rcsBurn > 0 ? ship.rcsPropellant / rcsBurn : 0;
    rcsBurn = ship.rcsPropellant;
  }

  const massBefore = shipMass(ship);
  ship.mainPropellant -= mainBurn;
  ship.rcsPropellant -= rcsBurn;
  const midMass = massBefore - (mainBurn + rcsBurn) / 2;

  ship.appliedThrottle = mainFraction;
  ship.appliedRcs.rotation.copy(rot).multiplyScalar(rcsFraction);
  ship.appliedRcs.translation.copy(tr).multiplyScalar(rcsFraction);

  const rcsForce = rcsConfig.force * rcsFraction;
  _force
    .set(tr.x * rcsForce, tr.y * rcsForce, tr.z * rcsForce - mainFraction * mainEngine.thrust)
    .applyQuaternion(ship.body.orientation);

  _torque.set(
    rot.x * rcsConfig.torque.x * rcsFraction,
    rot.y * rcsConfig.torque.y * rcsFraction,
    rot.z * rcsConfig.torque.z * rcsFraction,
  );

  integrateBody(ship.body, _force, _torque, midMass, shipInertia(ship.config, midMass), dt);
}
