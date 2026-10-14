import { Quaternion, Vector3 } from 'three/webgpu';
import type { BodyState } from './rigidBody';

/**
 * Ground contacts for landing (D-017, Stage 5): the four footpads are
 * spring-damper contacts with Coulomb friction against the ground, so the
 * ship settles, slides, or tips over physically; hull points detect strikes.
 */

/**
 * The ground under a point (Earth-centred, m): returns the point's height
 * above the ground (negative = below) and sets the ground normal (unit) and
 * the ground's own velocity there. Infinity where there is no contact terrain.
 */
export type GroundProbe = (point: Vector3, normal: Vector3, velocity: Vector3) => number;

/** Footpad centres in body axes (m): under the four legs, 45° between the RCS pods. */
export const FEET: readonly Vector3[] = [0, 1, 2, 3].map((k) => {
  const angle = Math.PI / 4 + (k * Math.PI) / 2;
  return new Vector3(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 5.04);
});

/** Hull points that must never touch the ground: nose tip, and rings at the hull's ends. */
export const HULL: readonly Vector3[] = [
  new Vector3(0, 0, -4.8),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const angle = (k * Math.PI) / 4;
    return new Vector3(Math.cos(angle) * 1.4, Math.sin(angle) * 1.4, 3.6);
  }),
  ...[0, 1, 2, 3].map((k) => {
    const angle = (k * Math.PI) / 2;
    return new Vector3(Math.cos(angle) * 1.3, Math.sin(angle) * 1.3, -2.6);
  }),
];

/** Below this height of the centre of mass above the ground, contacts are checked (m). */
export const CONTACT_RANGE = 10;

/** Leg stiffness (N/m) and damping ratio; friction coefficient and tangential damping (N·s/m). */
const LEG_STIFFNESS = 2e5;
const LEG_DAMPING_RATIO = 0.8;
const FRICTION = 0.6;
const FRICTION_DAMPING = 1e5;

export interface ContactResult {
  /** Feet touching the ground. */
  feet: number;
  /** A hull point is below the ground. */
  hullStrike: boolean;
}

const _r = new Vector3();
const _point = new Vector3();
const _normal = new Vector3();
const _ground = new Vector3();
const _v = new Vector3();
const _f = new Vector3();
const _tangential = new Vector3();
const _arm = new Vector3();
const _inverse = new Quaternion();

/**
 * Contact forces on the ship now: total force (world, N) and torque (body
 * axes, N·m) from the footpads, plus which points touch. `mass` sets the leg
 * damping, so it stays near critical whatever the propellant load.
 */
export function contactForces(
  body: BodyState,
  mass: number,
  probe: GroundProbe,
  force: Vector3,
  torque: Vector3,
): ContactResult {
  force.set(0, 0, 0);
  torque.set(0, 0, 0);
  const damping = 2 * LEG_DAMPING_RATIO * Math.sqrt((LEG_STIFFNESS * mass) / FEET.length);
  let feet = 0;
  for (const foot of FEET) {
    _r.copy(foot).applyQuaternion(body.orientation);
    _point.addVectors(body.position, _r);
    const height = probe(_point, _normal, _ground);
    if (height >= 0) continue;
    feet++;
    // Velocity of the foot relative to the ground: v + ω × r (ω in body axes, so rotate it).
    _v.copy(body.angularVelocity).applyQuaternion(body.orientation).cross(_r);
    _v.add(body.velocity).sub(_ground);
    const vn = _v.dot(_normal);
    const push = Math.max(0, -LEG_STIFFNESS * height - damping * vn);
    _tangential.copy(_v).addScaledVector(_normal, -vn).multiplyScalar(-FRICTION_DAMPING);
    const limit = FRICTION * push;
    if (_tangential.length() > limit) _tangential.setLength(limit);
    _f.copy(_normal).multiplyScalar(push).add(_tangential);
    force.add(_f);
    torque.add(_arm.crossVectors(_r, _f));
  }
  torque.applyQuaternion(_inverse.copy(body.orientation).invert());

  let hullStrike = false;
  for (const point of HULL) {
    _point.copy(point).applyQuaternion(body.orientation).add(body.position);
    if (probe(_point, _normal, _ground) < 0) {
      hullStrike = true;
      break;
    }
  }
  return { feet, hullStrike };
}

/** Touchdown limits (Panos, 2026-10-14): speeds in m/s relative to the ground, tilt in degrees. */
export const TOUCHDOWN_LIMITS = {
  safe: { vertical: 2, horizontal: 1, tilt: 10 },
  hard: { vertical: 5, horizontal: 2.5, tilt: 20 },
} as const;

export type Verdict = 'safe' | 'hard' | 'crash';

export interface Touchdown {
  verdict: Verdict;
  /** Descent speed, sideways speed (m/s), and tilt of the ship's axis from vertical (degrees). */
  vertical: number;
  horizontal: number;
  tilt: number;
}

/** Safe within all safe limits, hard (legs damaged) within the hard limits, otherwise a crash. */
export function judgeTouchdown(vertical: number, horizontal: number, tilt: number): Verdict {
  const within = (l: { vertical: number; horizontal: number; tilt: number }) =>
    vertical <= l.vertical && horizontal <= l.horizontal && tilt <= l.tilt;
  if (within(TOUCHDOWN_LIMITS.safe)) return 'safe';
  if (within(TOUCHDOWN_LIMITS.hard)) return 'hard';
  return 'crash';
}

const _up = new Vector3();
const _nose = new Vector3();
const _rel = new Vector3();

/**
 * The touchdown as it happens: speeds of the ship relative to the ground
 * (`ground` velocity) along and across the local vertical `up`, and the angle
 * between the nose and `up` (tail-down landings, D-043).
 */
export function touchdown(body: BodyState, up: Vector3, ground: Vector3): Touchdown {
  _up.copy(up).normalize();
  _rel.subVectors(body.velocity, ground);
  const vertical = -_rel.dot(_up);
  const horizontal = _rel.addScaledVector(_up, vertical).length();
  _nose.set(0, 0, -1).applyQuaternion(body.orientation);
  const tilt = (Math.acos(Math.min(1, Math.max(-1, _nose.dot(_up)))) * 180) / Math.PI;
  return { verdict: judgeTouchdown(vertical, horizontal, tilt), vertical, horizontal, tilt };
}
