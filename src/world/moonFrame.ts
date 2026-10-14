import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _inverse = new Quaternion();

/**
 * The Moon's orientation (Moon-fixed frame → Earth-centred frame): tidally
 * locked, its near side (longitude 0, local +X) toward Earth and its pole
 * (local +Z) along the orbit normal. Libration is ignored.
 */
export function moonOrientation(
  moonPosition: Vector3,
  moonVelocity: Vector3,
  out: Quaternion,
): Quaternion {
  _x.copy(moonPosition).negate().normalize();
  _z.crossVectors(moonPosition, moonVelocity).normalize();
  _y.crossVectors(_z, _x);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

/** Unit vector in the Moon-fixed frame for selenographic latitude and east longitude (degrees). */
export function selenographic(latDeg: number, lonDeg: number, out: Vector3): Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return out.set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
}

/**
 * Local east and north unit vectors at a Moon-fixed direction `up`
 * (north falls back to +Y at the poles).
 */
export function eastNorth(up: Vector3, east: Vector3, north: Vector3): void {
  east.set(-up.y, up.x, 0);
  if (east.lengthSq() < 1e-12) east.set(0, 1, 0);
  east.normalize();
  north.crossVectors(up, east);
}

/**
 * Moon-fixed frame at one instant: converts Moon-fixed points to the
 * Earth-centred frame and gives the ground's velocity anywhere.
 */
export class MoonFrame {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly orientation = new Quaternion();
  /** Angular velocity of the Moon-fixed frame, Earth-centred axes (rad/s). */
  readonly angularVelocity = new Vector3();
  private readonly _q = new Quaternion();
  private readonly _p = new Vector3();

  /** Updates from the Moon's state now and its state `dt` seconds later (for the spin rate). */
  set(
    position: Vector3,
    velocity: Vector3,
    laterPosition: Vector3,
    laterVelocity: Vector3,
    dt: number,
  ): void {
    this.position.copy(position);
    this.velocity.copy(velocity);
    moonOrientation(position, velocity, this.orientation);
    moonOrientation(laterPosition, laterVelocity, this._q);
    // ω from the small rotation between the two orientations: q_later = dq · q_now.
    const dq = this._q.multiply(_inverse.copy(this.orientation).invert());
    const s = Math.sqrt(dq.x * dq.x + dq.y * dq.y + dq.z * dq.z);
    const angle = 2 * Math.atan2(s, dq.w);
    if (s < 1e-15) this.angularVelocity.set(0, 0, 0);
    else this.angularVelocity.set(dq.x, dq.y, dq.z).multiplyScalar(angle / s / dt);
  }

  /** Moon-fixed point (m) → Earth-centred position. */
  toWorld(local: Vector3, out: Vector3): Vector3 {
    return out.copy(local).applyQuaternion(this.orientation).add(this.position);
  }

  /** Earth-centred position → Moon-fixed point (m). */
  toLocal(world: Vector3, out: Vector3): Vector3 {
    return out
      .subVectors(world, this.position)
      .applyQuaternion(this._q.copy(this.orientation).invert());
  }

  /** Velocity of the ground (a point fixed to the Moon) at an Earth-centred position. */
  groundVelocity(world: Vector3, out: Vector3): Vector3 {
    this._p.subVectors(world, this.position);
    return out.crossVectors(this.angularVelocity, this._p).add(this.velocity);
  }
}
