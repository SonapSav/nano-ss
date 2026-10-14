import { Vector3 } from 'three/webgpu';
import type { BodyInfo } from './bodies';

/** Speed of light (m/s). */
export const C = 299_792_458;
/** Speed bands in multiples of c (D-015). */
export const BANDS = [0.1, 1, 10, 100] as const;
/** Charge-up before the drive engages (s, D-018). */
export const CHARGE_TIME = 5;
/** Governor: the remaining distance to a body's drop-out altitude is covered in this time constant (s). */
const GOVERNOR_TAU = 2;
/** Slowest governed speed, so the approach ends instead of creeping forever (m/s). */
const MIN_SPEED = 2_000;

export interface BodyNow {
  info: BodyInfo;
  position: Vector3;
  velocity: Vector3;
}

/** Band index from the throttle in quarters: 0–25 % → 0.1c … 75–100 % → 100c. */
export function bandFromThrottle(throttle: number): number {
  return Math.min(BANDS.length - 1, Math.max(0, Math.floor(throttle * BANDS.length)));
}

/** The body whose safety altitude blocks engaging here, if any (D-015 gravity wells). */
export function blockingBody(position: Vector3, bodies: readonly BodyNow[]): BodyNow | null {
  for (const b of bodies) {
    if (position.distanceTo(b.position) - b.info.radius < b.info.hyperAltitude) return b;
  }
  return null;
}

const _toBody = new Vector3();

/**
 * Hyperdrive speed after the governor (m/s): bodies the ship is closing on
 * limit it to (altitude − drop altitude) / (τ · cos θ), so the approach slows
 * smoothly and ends at the drop-out altitude; bodies being left do not limit.
 */
export function governedSpeed(
  position: Vector3,
  heading: Vector3,
  bandSpeed: number,
  bodies: readonly BodyNow[],
): number {
  let speed = bandSpeed;
  for (const b of bodies) {
    _toBody.subVectors(b.position, position);
    const distance = _toBody.length();
    const cos = _toBody.dot(heading) / distance;
    if (cos <= 0) continue;
    const margin = distance - b.info.radius - b.info.hyperAltitude;
    speed = Math.min(speed, Math.max(MIN_SPEED, margin / (GOVERNOR_TAU * cos)));
  }
  return speed;
}

/** The closing body at or below its drop-out altitude (the drive drops out there), if any. */
export function arrivalBody(
  position: Vector3,
  heading: Vector3,
  bodies: readonly BodyNow[],
): BodyNow | null {
  for (const b of bodies) {
    _toBody.subVectors(b.position, position);
    const altitude = _toBody.length() - b.info.radius;
    if (_toBody.dot(heading) > 0 && altitude <= b.info.hyperAltitude) return b;
  }
  return null;
}

/** Seconds until the drop-out altitude of the first body ahead at the current speed, or NaN. */
export function timeToArrival(
  position: Vector3,
  heading: Vector3,
  speed: number,
  bodies: readonly BodyNow[],
): { body: BodyNow; seconds: number } | null {
  let best: { body: BodyNow; seconds: number } | null = null;
  for (const b of bodies) {
    _toBody.subVectors(b.position, position);
    const along = _toBody.dot(heading);
    if (along <= 0) continue;
    // Only bodies roughly ahead: the heading passes within 10 radii.
    const miss = Math.sqrt(Math.max(0, _toBody.lengthSq() - along * along));
    if (miss > b.info.radius * 10) continue;
    const seconds = (along - b.info.radius - b.info.hyperAltitude) / speed;
    if (!best || seconds < best.seconds) best = { body: b, seconds: Math.max(0, seconds) };
  }
  return best;
}

const _radial = new Vector3();
const _tangent = new Vector3();

/**
 * Velocity for a circular orbit around `body` at the ship's current radius,
 * turning in the direction the ship was heading (arrival state, Stage 4).
 */
export function circularOrbitVelocity(
  position: Vector3,
  heading: Vector3,
  body: BodyNow,
  out: Vector3,
): Vector3 {
  _radial.subVectors(position, body.position);
  const r = _radial.length();
  _radial.divideScalar(r);
  _tangent.copy(heading).addScaledVector(_radial, -heading.dot(_radial));
  if (_tangent.lengthSq() < 1e-6) {
    // Heading straight at (or away from) the body: pick any direction around it.
    _tangent.set(0, 0, 1).cross(_radial);
    if (_tangent.lengthSq() < 1e-6) _tangent.set(1, 0, 0).cross(_radial);
  }
  return out
    .copy(_tangent.normalize())
    .multiplyScalar(Math.sqrt(body.info.gm / r))
    .add(body.velocity);
}

export type HyperState = 'idle' | 'charging' | 'active';

/** Hyperdrive state machine: idle → charging (5 s) → active → idle (drop-out). */
export class Hyperdrive {
  state: HyperState = 'idle';
  chargeRemaining = 0;
  /** Speed actually flown in the last step (m/s). */
  speed = 0;
  private engageRequested = false;
  private dropRequested = false;

  requestEngage(): void {
    this.engageRequested = true;
  }

  requestDrop(): void {
    this.dropRequested = true;
  }

  /**
   * Advances charging and handles requests. Returns what happened:
   * 'charging' started, 'blocked', 'aborted', 'engaged', 'drop' (the caller
   * then puts the ship into orbit), or null.
   */
  update(
    dt: number,
    blocked: boolean,
  ): 'charging' | 'blocked' | 'aborted' | 'engaged' | 'drop' | null {
    const engage = this.engageRequested;
    const drop = this.dropRequested;
    this.engageRequested = false;
    this.dropRequested = false;

    if (this.state === 'active') return drop ? 'drop' : null;
    if (this.state === 'charging') {
      if (drop || blocked) {
        this.state = 'idle';
        return 'aborted';
      }
      this.chargeRemaining -= dt;
      if (this.chargeRemaining <= 0) {
        this.state = 'active';
        return 'engaged';
      }
      return null;
    }
    if (engage) {
      if (blocked) return 'blocked';
      this.state = 'charging';
      this.chargeRemaining = CHARGE_TIME;
      return 'charging';
    }
    return null;
  }

  finishDrop(): void {
    this.state = 'idle';
    this.speed = 0;
  }
}
