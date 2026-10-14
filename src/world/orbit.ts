import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { EARTH, MOON } from './bodies';

/** A point moving under gravity (position m, velocity m/s), Earth-centred inertial frame. */
export interface PointState {
  position: Vector3;
  velocity: Vector3;
}

/** Acceleration at sim time `t` (s, relative to the step start) and position `p` (m), into `out` (m/s²). */
export type AccelerationField = (t: number, p: Vector3, out: Vector3) => Vector3;

const _toMoon = new Vector3();

/**
 * Gravity in the Earth-centred frame: Earth's pull, the Moon's pull, and the
 * indirect term for Earth itself being pulled toward the Moon (which keeps the
 * Earth-centred frame consistent). The Sun's pull is left out: its tidal
 * effect in cislunar space is tiny.
 */
export function gravity(p: Vector3, moon: Vector3, out: Vector3): Vector3 {
  const r = p.length();
  out.copy(p).multiplyScalar(-EARTH.gm / (r * r * r));
  _toMoon.subVectors(moon, p);
  const dm = _toMoon.length();
  const rm = moon.length();
  out.addScaledVector(_toMoon, MOON.gm / (dm * dm * dm));
  out.addScaledVector(moon, -MOON.gm / (rm * rm * rm));
  return out;
}

const _k = Array.from({ length: 8 }, () => new Vector3());
const _p = new Vector3();
const _v = new Vector3();

/** Classic RK4 step of a point under an acceleration field, from sim time `t0` for `dt` seconds. */
export function integratePoint(
  state: PointState,
  accel: AccelerationField,
  t0: number,
  dt: number,
): void {
  const [k1v, k2v, k3v, k4v, k1x, k2x, k3x, k4x] = _k as [
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3,
  ];
  const x = state.position;
  const v = state.velocity;
  k1x.copy(v);
  accel(t0, x, k1v);
  k2x.copy(v).addScaledVector(k1v, dt / 2);
  accel(t0 + dt / 2, _p.copy(x).addScaledVector(k1x, dt / 2), k2v);
  k3x.copy(v).addScaledVector(k2v, dt / 2);
  accel(t0 + dt / 2, _p.copy(x).addScaledVector(k2x, dt / 2), k3v);
  k4x.copy(v).addScaledVector(k3v, dt);
  accel(t0 + dt, _p.copy(x).addScaledVector(k3x, dt), k4v);
  x.addScaledVector(k1x, dt / 6)
    .addScaledVector(k2x, dt / 3)
    .addScaledVector(k3x, dt / 3)
    .addScaledVector(k4x, dt / 6);
  _v.copy(k1v)
    .multiplyScalar(dt / 6)
    .addScaledVector(k2v, dt / 3)
    .addScaledVector(k3v, dt / 3)
    .addScaledVector(k4v, dt / 6);
  v.add(_v);
}

export interface OrbitElements {
  /** Semi-major axis (m); negative for escape orbits. */
  semiMajorAxis: number;
  eccentricity: number;
  periapsisRadius: number;
  /** Infinity for escape orbits. */
  apoapsisRadius: number;
  /** Orbital period (s); NaN for escape orbits. */
  period: number;
  /** Inclination to the ICRF equator, about Earth's equator (rad). */
  inclination: number;
  /** Time until the next periapsis and apoapsis (s); NaN where not defined. */
  timeToPeriapsis: number;
  timeToApoapsis: number;
  /** Eccentricity vector (points to periapsis) and angular momentum vector. */
  eVector: Vector3;
  hVector: Vector3;
}

/** Keplerian elements of position `r` and velocity `v` relative to a body with parameter `gm`. */
export function orbitElements(r: Vector3, v: Vector3, gm: number): OrbitElements {
  const rLen = r.length();
  const hVector = new Vector3().crossVectors(r, v);
  const eVector = new Vector3()
    .crossVectors(v, hVector)
    .divideScalar(gm)
    .addScaledVector(r, -1 / rLen);
  const e = eVector.length();
  const energy = v.lengthSq() / 2 - gm / rLen;
  const a = -gm / (2 * energy);
  const p = hVector.lengthSq() / gm; // semi-latus rectum, valid for all conics
  const periapsisRadius = p / (1 + e);
  const bound = e < 1;
  const period = bound ? 2 * Math.PI * Math.sqrt((a * a * a) / gm) : NaN;
  const inclination = Math.acos(Math.min(1, Math.max(-1, hVector.z / hVector.length())));

  // Mean anomaly from the eccentric anomaly, for time to the apsides (bound orbits).
  let timeToPeriapsis = NaN;
  let timeToApoapsis = NaN;
  if (bound && e > 1e-6) {
    const cosNu = Math.min(1, Math.max(-1, eVector.dot(r) / (e * rLen)));
    let nu = Math.acos(cosNu);
    if (r.dot(v) < 0) nu = 2 * Math.PI - nu;
    const E =
      2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    const M = (E - e * Math.sin(E) + 2 * Math.PI) % (2 * Math.PI);
    const n = (2 * Math.PI) / period;
    timeToPeriapsis = (2 * Math.PI - M) / n;
    timeToApoapsis = ((Math.PI - M + 2 * Math.PI) % (2 * Math.PI)) / n;
  }

  return {
    semiMajorAxis: a,
    eccentricity: e,
    periapsisRadius,
    apoapsisRadius: bound ? a * (1 + e) : Infinity,
    period,
    inclination,
    timeToPeriapsis,
    timeToApoapsis,
    eVector,
    hVector,
  };
}

/** Speed of a circular orbit at radius `r` (m/s). */
export const circularSpeed = (gm: number, r: number): number => Math.sqrt(gm / r);

/**
 * Stage 3 start (decided 2026-10-14): circular low Earth orbit at 400 km and
 * 51.6° inclination (ISS-like). Returns the state `phase` radians along the
 * orbit, so the target can co-orbit ahead of the ship.
 */
export function leoStartState(altitude = 400_000, inclinationDeg = 51.6, phase = 0): PointState {
  const r = EARTH.radius + altitude;
  const inc = (inclinationDeg * Math.PI) / 180;
  const speed = circularSpeed(EARTH.gm, r);
  const position = new Vector3(
    Math.cos(phase) * r,
    Math.sin(phase) * Math.cos(inc) * r,
    Math.sin(phase) * Math.sin(inc) * r,
  );
  const velocity = new Vector3(
    -Math.sin(phase),
    Math.cos(phase) * Math.cos(inc),
    Math.cos(phase) * Math.sin(inc),
  ).multiplyScalar(speed);
  return { position, velocity };
}

/**
 * Phase along the start orbit closest to the Sun, so the ship starts in
 * daylight (the orbit plane is fixed by the inclination, as in leoStartState).
 */
export function sunlitPhase(sun: Vector3, inclinationDeg = 51.6): number {
  const inc = (inclinationDeg * Math.PI) / 180;
  return Math.atan2(sun.y * Math.cos(inc) + sun.z * Math.sin(inc), sun.x);
}

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

/** Orientation with the nose (-Z) along `forward` and the roof (+Y) toward `up`. */
export function orientationFromForwardUp(
  forward: Vector3,
  up: Vector3,
  out: Quaternion,
): Quaternion {
  _z.copy(forward).normalize().negate();
  _x.crossVectors(up, _z).normalize();
  _y.crossVectors(_z, _x);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

export type Hazard = { kind: 'burned-up'; body: 'Earth' } | { kind: 'crashed'; body: 'Moon' };

/** Checks the ship against Earth's atmosphere line (100 km, D-044) and the Moon's surface. */
export function checkHazard(position: Vector3, moon: Vector3): Hazard | null {
  if (position.length() - EARTH.radius < EARTH.hazardAltitude)
    return { kind: 'burned-up', body: 'Earth' };
  if (position.distanceTo(moon) - MOON.radius < MOON.hazardAltitude)
    return { kind: 'crashed', body: 'Moon' };
  return null;
}
