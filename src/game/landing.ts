import { Quaternion, Vector3 } from 'three/webgpu';
import {
  CONTACT_RANGE,
  contactForces,
  touchdown,
  TOUCHDOWN_LIMITS,
  type Touchdown,
} from '../sim/contact';
import type { ControlState } from '../sim/controls';
import { shipMass, type Ship } from '../sim/ship';
import type { Hazard } from '../world/orbit';
import type { Spaceport } from '../world/sites';
import type { World } from '../world/world';

export type LandingEvent = 'touchdown-safe' | 'touchdown-hard' | 'landed' | 'liftoff' | 'serviced';

/** Airborne this long before the next contact counts as a new touchdown (bounces don't), s. */
const REJUDGE_AFTER = 1;
/** Landed after this long on all four feet, nearly still, engines off (s, m/s, rad/s). */
const SETTLE_TIME = 2;
const SETTLE_SPEED = 0.1;
const SETTLE_RATE = 0.01;
/** Tilt from vertical that counts as tipped over while touching the ground (degrees). */
const TIP_OVER = 60;
/** Landed within this distance of a pad centre, the spaceport refuels and repairs the ship (m, s). */
export const SERVICE_RADIUS = 25;
export const SERVICE_TIME = 10;
const INPUT = 0.01;

/** Landing state of the ship (Stage 5). */
export class Landing {
  phase: 'flying' | 'contact' | 'landed' = 'flying';
  /** A hard landing damaged the legs; another one collapses them. Repaired at a pad. */
  legsDamaged = false;
  /** The last touchdown and its verdict, for the HUD. */
  touchdown: Touchdown | null = null;
  /** Feet on the ground in the last step. */
  feet = 0;
  /** Spaceport servicing the ship (landed on its pad), and progress from 0 to 1. */
  servicePort: Spaceport | null = null;
  service = 0;
  /** Contact force (world, N) and torque (body axes, N·m) for the step. */
  readonly force = new Vector3();
  readonly torque = new Vector3();
  /** Where the landed ship sits in the Moon-fixed frame. */
  readonly local = new Vector3();
  readonly localOrientation = new Quaternion();
  airborne = Infinity;
  settled = 0;

  reset(): void {
    this.phase = 'flying';
    this.legsDamaged = false;
    this.touchdown = null;
    this.feet = 0;
    this.servicePort = null;
    this.service = 0;
    this.airborne = Infinity;
    this.settled = 0;
  }
}

/** Throttle or any translation input lifts a landed ship off. */
export function liftoffRequested(controls: ControlState): boolean {
  return (
    controls.throttle > 0 ||
    Math.abs(controls.up) > INPUT ||
    Math.abs(controls.right) > INPUT ||
    Math.abs(controls.forward) > INPUT
  );
}

export function liftOff(landing: Landing): void {
  landing.phase = 'contact';
  landing.settled = 0;
  landing.servicePort = null;
  landing.service = 0;
}

const _normal = new Vector3();
const _ground = new Vector3();
const _up = new Vector3();
const _nose = new Vector3();
const _rel = new Vector3();
const _inverse = new Quaternion();

/** Why a touchdown was a crash, for the alert. */
function crashDetail(t: Touchdown): string {
  const hard = TOUCHDOWN_LIMITS.hard;
  if (t.vertical > hard.vertical) return `touched down at ${t.vertical.toFixed(1)} m/s`;
  if (t.horizontal > hard.horizontal)
    return `touched down sliding at ${t.horizontal.toFixed(1)} m/s`;
  return `touched down tilted ${t.tilt.toFixed(0)}°`;
}

export interface ContactStep {
  /** Contact force and torque to apply this step, or undefined when clear of the ground. */
  external: { force: Vector3; torque: Vector3 } | undefined;
  hazard: Hazard | null;
  event: LandingEvent | null;
}

/**
 * Ground contacts at the start of a step (before integrating): forces from
 * the feet, touchdown judgement at first contact, hull strikes and tipping.
 */
export function landingContacts(
  landing: Landing,
  ship: Ship,
  world: World,
  dt: number,
): ContactStep {
  const body = ship.body;
  const out: ContactStep = { external: undefined, hazard: null, event: null };
  if (world.probeGround(body.position, _normal, _ground) > CONTACT_RANGE) {
    landing.feet = 0;
    landing.airborne += dt;
    if (landing.phase === 'contact') landing.phase = 'flying';
    return out;
  }
  const result = contactForces(
    body,
    shipMass(ship),
    world.probeGround,
    landing.force,
    landing.torque,
  );
  landing.feet = result.feet;
  out.external = { force: landing.force, torque: landing.torque };
  if (result.hullStrike) {
    out.hazard = { kind: 'crashed', body: 'Moon', detail: 'the hull struck the ground' };
    return out;
  }
  _up.subVectors(body.position, world.moonPosition).normalize();
  if (result.feet === 0) {
    landing.airborne += dt;
    return out;
  }
  if (landing.airborne >= REJUDGE_AFTER) {
    const t = touchdown(body, _up, world.moonFrame.groundVelocity(body.position, _ground));
    landing.touchdown = t;
    if (t.verdict === 'crash') {
      out.hazard = { kind: 'crashed', body: 'Moon', detail: crashDetail(t) };
      return out;
    }
    if (t.verdict === 'hard') {
      if (landing.legsDamaged) {
        out.hazard = { kind: 'crashed', body: 'Moon', detail: 'the damaged legs collapsed' };
        return out;
      }
      landing.legsDamaged = true;
    }
    out.event = t.verdict === 'safe' ? 'touchdown-safe' : 'touchdown-hard';
  }
  landing.airborne = 0;
  landing.phase = 'contact';
  _nose.set(0, 0, -1).applyQuaternion(body.orientation);
  if ((Math.acos(Math.min(1, _nose.dot(_up))) * 180) / Math.PI > TIP_OVER) {
    out.hazard = { kind: 'crashed', body: 'Moon', detail: 'the ship tipped over' };
  }
  return out;
}

/** After a step in contact: once settled on all four feet, the ship is landed and attached to the Moon. */
export function settle(
  landing: Landing,
  ship: Ship,
  world: World,
  dt: number,
): LandingEvent | null {
  if (landing.phase !== 'contact') return null;
  const body = ship.body;
  _rel.subVectors(body.velocity, world.moonFrame.groundVelocity(body.position, _ground));
  const still =
    landing.feet === 4 &&
    ship.appliedThrottle === 0 &&
    ship.appliedRetro === 0 &&
    _rel.length() < SETTLE_SPEED &&
    body.angularVelocity.length() < SETTLE_RATE;
  landing.settled = still ? landing.settled + dt : 0;
  if (landing.settled < SETTLE_TIME) return null;

  landing.phase = 'landed';
  world.moonFrame.toLocal(body.position, landing.local);
  landing.localOrientation.copy(world.moonFrame.orientation).invert().multiply(body.orientation);
  const pad = world.nearestPad(body.position);
  landing.servicePort = pad && pad.distance < SERVICE_RADIUS ? pad.port : null;
  landing.service = 0;
  holdLanded(landing, ship, world, 0);
  return 'landed';
}

/**
 * A landed ship moves with the ground (stable at any time warp); on a pad
 * the spaceport refuels both tanks and repairs the legs over SERVICE_TIME.
 */
export function holdLanded(
  landing: Landing,
  ship: Ship,
  world: World,
  dt: number,
): LandingEvent | null {
  const body = ship.body;
  const frame = world.moonFrame;
  frame.toWorld(landing.local, body.position);
  frame.groundVelocity(body.position, body.velocity);
  body.orientation.copy(frame.orientation).multiply(landing.localOrientation);
  body.angularVelocity
    .copy(frame.angularVelocity)
    .applyQuaternion(_inverse.copy(body.orientation).invert());
  ship.appliedThrottle = 0;
  ship.appliedRetro = 0;
  ship.appliedRcs.rotation.set(0, 0, 0);
  ship.appliedRcs.translation.set(0, 0, 0);
  landing.feet = 4;

  if (!landing.servicePort || landing.service >= 1) return null;
  const share = dt / SERVICE_TIME;
  const { mainPropellantCapacity, rcsPropellantCapacity } = ship.config;
  ship.mainPropellant = Math.min(
    mainPropellantCapacity,
    ship.mainPropellant + mainPropellantCapacity * share,
  );
  ship.rcsPropellant = Math.min(
    rcsPropellantCapacity,
    ship.rcsPropellant + rcsPropellantCapacity * share,
  );
  landing.service = Math.min(1, landing.service + share);
  if (landing.service < 1) return null;
  ship.mainPropellant = mainPropellantCapacity;
  ship.rcsPropellant = rcsPropellantCapacity;
  landing.legsDamaged = false;
  return 'serviced';
}
