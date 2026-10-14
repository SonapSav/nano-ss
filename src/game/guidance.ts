import { Quaternion, Vector3 } from 'three/webgpu';
import { FEET } from '../sim/contact';
import { MOON } from '../world/bodies';
import type { Spaceport } from '../world/sites';
import { groundRadius } from '../world/terrain';
import type { World } from '../world/world';

/**
 * Landing guidance for a spaceport (Stage 5c): where the pad is, how high
 * and fast the ship is over the ground, and where it would hit the ground
 * if it stopped thrusting now.
 */
export interface Guidance {
  port: Spaceport;
  /** Pad centre now (Earth-centred, m), and the straight-line distance to it. */
  pad: Vector3;
  distance: number;
  /** Inside the Moon's sphere of influence: only then do the ground figures and the impact mean anything. */
  nearMoon: boolean;
  /** Great-circle distance from the point under the ship to the pad (m), and its bearing (degrees from north). */
  surfaceDistance: number;
  bearing: number;
  /** Angle from the ship to the pad along its orbit, in the direction of motion (0–360°), and the pad's distance from the orbit plane (m). */
  angleAhead: number;
  offTrack: number;
  /** Height of the feet over the ground below (m), descent speed and sideways speed over the ground (m/s). */
  radarAltitude: number;
  descentRate: number;
  groundSpeed: number;
  /** Ballistic impact point (Moon-fixed), time to it, and miss from the pad along / across the track (m; + = long / right). */
  impact: { local: Vector3; time: number; along: number; across: number } | null;
}

/** Feet below the centre of mass, tail down (m). */
const FOOT_DEPTH = FEET[0]?.z ?? 5;
/** Impact prediction looks this far ahead (s): more than one low lunar orbit. */
const IMPACT_HORIZON = 3 * 3600;

const _rel = new Vector3();
const _v = new Vector3();
const _a = new Vector3();
const _local = new Vector3();
const _previous = new Vector3();
const _spin = new Quaternion();
const _inverse = new Quaternion();
const _axis = new Vector3();

/**
 * Moon-fixed point of a Moon-centred inertial offset `rel`, `t` seconds from
 * now: the Moon has turned by ω·t meanwhile.
 */
function toLocalAt(world: World, rel: Vector3, t: number, out: Vector3): Vector3 {
  const w = world.moonFrame.angularVelocity;
  const rate = w.length();
  out.copy(rel);
  if (rate > 0)
    out.applyQuaternion(_spin.setFromAxisAngle(_axis.copy(w).divideScalar(rate), -rate * t));
  return out.applyQuaternion(_inverse.copy(world.moonFrame.orientation).invert());
}

/**
 * Where a ship coasting under the Moon's gravity from `position`/`velocity`
 * meets the ground: Moon-fixed point and time, or null if it stays up.
 * Earth's tide is left out (a few hundred metres over an hour).
 */
export function predictImpact(
  world: World,
  position: Vector3,
  velocity: Vector3,
  outLocal: Vector3,
  outVelocity?: Vector3,
): number | null {
  const sites = world.spaceports.map((p) => p.site);
  _rel.subVectors(position, world.moonPosition);
  _v.subVectors(velocity, world.moonVelocity);
  const accelerate = () => _a.copy(_rel).multiplyScalar(-MOON.gm / _rel.lengthSq() / _rel.length());
  const heightAt = (t: number) => {
    toLocalAt(world, _rel, t, _local);
    return _local.length() - groundRadius(sites, _local);
  };
  let t = 0;
  let h = heightAt(0);
  if (h <= 0) {
    outLocal.copy(_local);
    outVelocity?.copy(_v);
    return 0;
  }
  accelerate();
  for (let i = 0; i < 20_000 && t < IMPACT_HORIZON; i++) {
    const vr = _v.dot(_rel) / _rel.length();
    const dt = Math.min(20, Math.max(0.05, (0.25 * h) / Math.max(1, -vr)));
    _previous.copy(_local);
    const hPrevious = h;
    // Leapfrog (kick-drift-kick).
    _v.addScaledVector(_a, dt / 2);
    _rel.addScaledVector(_v, dt);
    accelerate();
    _v.addScaledVector(_a, dt / 2);
    t += dt;
    h = heightAt(t);
    if (h <= 0) {
      const f = hPrevious / (hPrevious - h);
      outLocal.lerpVectors(_previous, _local, f);
      outVelocity?.copy(_v);
      return t - dt * (1 - f);
    }
  }
  return null;
}

const _up = new Vector3();
const _east = new Vector3();
const _north = new Vector3();
const _padLocal = new Vector3();
const _padDir = new Vector3();
const _normal = new Vector3();
const _ground = new Vector3();
const _rv = new Vector3();
const _miss = new Vector3();
const _track = new Vector3();
const _right = new Vector3();
const _impactVelocity = new Vector3();
const POLE = new Vector3(0, 0, 1);

/** Guidance to `port` for a ship at `position` with `velocity` (Earth-centred). */
export function computeGuidance(
  world: World,
  port: Spaceport,
  position: Vector3,
  velocity: Vector3,
): Guidance {
  const frame = world.moonFrame;
  const pad = frame.toWorld(port.site.padPoint(_padLocal), new Vector3());

  // Bearing and surface distance, Moon-fixed.
  frame.toLocal(position, _up).normalize();
  _east.crossVectors(POLE, _up);
  if (_east.lengthSq() < 1e-12) _east.set(0, 1, 0);
  _east.normalize();
  _north.crossVectors(_up, _east);
  _padDir.copy(_padLocal).normalize();
  const surfaceDistance = MOON.radius * Math.acos(Math.min(1, Math.max(-1, _up.dot(_padDir))));
  const bearing =
    ((Math.atan2(_padDir.dot(_east), _padDir.dot(_north)) * 180) / Math.PI + 360) % 360;

  // Pad against the orbit (Moon-centred inertial).
  _rel.subVectors(position, world.moonPosition);
  _rv.subVectors(velocity, world.moonVelocity);
  const normal = _normal.crossVectors(_rel, _rv).normalize();
  _padDir.subVectors(pad, world.moonPosition).normalize();
  const offTrack = MOON.radius * Math.asin(Math.min(1, Math.max(-1, _padDir.dot(normal))));
  _padDir.addScaledVector(normal, -_padDir.dot(normal)).normalize();
  _rel.normalize();
  const angleAhead =
    ((Math.atan2(_miss.crossVectors(_rel, _padDir).dot(normal), _rel.dot(_padDir)) * 180) /
      Math.PI +
      360) %
    360;

  // Height and speeds over the ground.
  const height = world.probeGround(position, _ground, _ground);
  const radarAltitude =
    (Number.isFinite(height) ? height : world.moonGroundAltitude(position)) - FOOT_DEPTH;
  frame.groundVelocity(position, _ground);
  _rv.subVectors(velocity, _ground);
  _up.subVectors(position, world.moonPosition).normalize();
  const descentRate = -_rv.dot(_up);
  const groundSpeed = _rv.addScaledVector(_up, descentRate).length();

  let impact: Guidance['impact'] = null;
  const nearMoon = world.referenceBody(position) === MOON;
  const time = nearMoon ? predictImpact(world, position, velocity, _local, _impactVelocity) : null;
  if (time !== null) {
    // Miss on the ground: along the track (direction of motion over the ground) and across it.
    toLocalAt(world, _impactVelocity, time, _track);
    _up.copy(_local).normalize();
    _track.addScaledVector(_up, -_track.dot(_up)).normalize();
    _right.crossVectors(_track, _up);
    _miss.subVectors(_local, _padLocal);
    impact = {
      local: _local.clone(),
      time,
      along: _miss.dot(_track),
      across: _miss.dot(_right),
    };
  }
  return {
    port,
    pad,
    distance: pad.distanceTo(position),
    nearMoon,
    surfaceDistance,
    bearing,
    angleAhead,
    offTrack,
    radarAltitude,
    descentRate,
    groundSpeed,
    impact,
  };
}

/**
 * Pad position `seconds` from now relative to the Moon's centre (inertial
 * axes): the Moon turns under the orbit meanwhile.
 */
export function padOffsetAt(world: World, port: Spaceport, seconds: number, out: Vector3): Vector3 {
  const frame = world.moonFrame;
  port.site.padPoint(out).applyQuaternion(frame.orientation);
  const w = frame.angularVelocity;
  const rate = w.length();
  if (rate > 0)
    out.applyQuaternion(_spin.setFromAxisAngle(_axis.copy(w).divideScalar(rate), rate * seconds));
  return out;
}
