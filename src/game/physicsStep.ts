import { Vector3 } from 'three/webgpu';
import type { ControlState } from '../sim/controls';
import { computeCommands, createFlightCommands, type FlightComputer } from '../sim/flightComputer';
import { stepShip, type Ship } from '../sim/ship';
import { EARTH, MOON, type BodyInfo } from '../world/bodies';
import { checkHazard, orbitElements, type Hazard } from '../world/orbit';
import {
  TARGET_WARP_ZONE,
  TimeWarp,
  maxSubstep,
  warpDrop,
  type WarpDropReason,
} from '../world/timeWarp';
import { TARGET_NEAR, type World } from '../world/world';
import {
  BANDS,
  C,
  Hyperdrive,
  arrivalBody,
  bandFromThrottle,
  blockingBody,
  circularOrbitVelocity,
  governedSpeed,
  type BodyNow,
} from '../world/hyperdrive';

/** Everything one physics step reads and changes. */
export interface PhysicsState {
  ship: Ship;
  world: World;
  fc: FlightComputer;
  controls: ControlState;
  warp: TimeWarp;
  commands: ReturnType<typeof createFlightCommands>;
  /** Body orbited at the end of the last step, and whether the ship was inside the target zone. */
  reference: BodyInfo;
  insideTargetZone: boolean;
  hyper: Hyperdrive;
}

export type HyperEvent = 'charging' | 'blocked' | 'aborted' | 'engaged' | 'arrived' | 'dropped';

export interface StepEvents {
  hazard: Hazard | null;
  warpDrop: WarpDropReason | null;
  hyper: HyperEvent | null;
}

const INPUT = 0.01;

export function createPhysicsState(
  ship: Ship,
  world: World,
  fc: FlightComputer,
  controls: ControlState,
): PhysicsState {
  return {
    ship,
    world,
    fc,
    controls,
    warp: new TimeWarp(),
    commands: createFlightCommands(),
    reference: world.referenceBody(ship.body.position),
    insideTargetZone: ship.body.position.distanceTo(world.target.position) < TARGET_WARP_ZONE,
    hyper: new Hyperdrive(),
  };
}

/** Earth and the Moon as they are now, for the hyperdrive. */
export function bodiesNow(world: World): BodyNow[] {
  return [
    {
      info: EARTH,
      position: world.bodyState(EARTH).position,
      velocity: world.bodyState(EARTH).velocity,
    },
    { info: MOON, position: world.moonPosition, velocity: world.moonVelocity },
  ];
}

const _heading = new Vector3();

/** Puts the ship into a circular orbit around the body it is in, ending the jump. */
function dropOut(s: PhysicsState, bodies: BodyNow[], at?: BodyNow | null): void {
  const body = s.ship.body;
  const refInfo = s.world.referenceBody(body.position);
  const ref = at ?? bodies.find((b) => b.info === refInfo) ?? bodies[0];
  if (ref) circularOrbitVelocity(body.position, _heading, ref, body.velocity);
  s.hyper.finishDrop();
}

const _orbital = new Vector3();
const _faReference = new Vector3();
const _relative = new Vector3();

const _noTranslation = new Vector3();

/**
 * One step in hyperdrive: time warp held at 1×, the pilot steers with the
 * rotation controls, and the ship moves along its nose at the governed band
 * speed, without gravity. At a body's drop-out altitude it drops into orbit.
 */
function stepHyperdrive(s: PhysicsState, dt: number, bodies: BodyNow[], events: StepEvents): void {
  const { ship, world, fc, controls, commands } = s;
  const body = ship.body;
  s.warp.limit(1);

  computeCommands(fc, ship, controls, commands, {
    orbitalVelocity: body.velocity,
    faReference: null,
  });
  commands.engines.main = 0;
  commands.engines.retro = 0;
  commands.rcs.translation.copy(_noTranslation);

  const speed = governedSpeed(
    body.position,
    _heading,
    (BANDS[bandFromThrottle(controls.throttle)] ?? 0.1) * C,
    bodies,
  );
  s.hyper.speed = speed;
  body.velocity.copy(_heading).multiplyScalar(speed);
  // No gravity argument: the drive bubble carries the ship in a straight line at this speed.
  stepShip(ship, commands.engines, commands.rcs, dt);
  world.stepTarget(dt);
  world.clock.seconds += dt;
  world.refresh();
  _heading.set(0, 0, -1).applyQuaternion(body.orientation);

  const arrived = arrivalBody(body.position, _heading, bodiesNow(world));
  if (arrived) {
    dropOut(s, bodiesNow(world), arrived);
    events.hyper = 'arrived';
  }
  events.hazard = checkHazard(body.position, world.moonPosition);
}

/**
 * Advances the game by one physics step of `realDt` seconds of real time:
 * `realDt × warp` of simulated time, split into substeps short enough for
 * accurate orbits. Above 4× warp the ship coasts (no engines or RCS).
 */
export function stepPhysics(s: PhysicsState, realDt: number): StepEvents {
  const { ship, world, fc, controls, commands } = s;
  const events: StepEvents = { hazard: null, warpDrop: null, hyper: null };
  const body = ship.body;

  // Hyperdrive requests and charging (D-015, D-018, Stage 4).
  const bodies = bodiesNow(world);
  _heading.set(0, 0, -1).applyQuaternion(body.orientation);
  const change = s.hyper.update(realDt, blockingBody(body.position, bodies) !== null);
  if (change === 'drop') {
    dropOut(s, bodies);
    events.hyper = 'dropped';
  } else if (change) {
    events.hyper = change;
  }
  if (s.hyper.state === 'active') {
    stepHyperdrive(s, realDt, bodies, events);
    return events;
  }

  // Commands once per step, from the state at its start.
  const reference = world.bodyState(world.referenceBody(body.position));
  _orbital.subVectors(body.velocity, reference.velocity);
  if (s.warp.coasting) {
    commands.engines.main = 0;
    commands.engines.retro = 0;
    commands.rcs.rotation.set(0, 0, 0);
    commands.rcs.translation.set(0, 0, 0);
  } else {
    const nearTarget = body.position.distanceTo(world.target.position) < TARGET_NEAR;
    computeCommands(fc, ship, controls, commands, {
      orbitalVelocity: _orbital,
      faReference: nearTarget ? world.targetFrameVelocity(body.position, _faReference) : null,
    });
  }

  // Substeps: the Moon is looked up at each substep time, so step everything before advancing the clock.
  const simDt = realDt * s.warp.factor;
  const longest = maxSubstep([
    { distance: body.position.length(), gm: EARTH.gm },
    { distance: body.position.distanceTo(world.moonPosition), gm: MOON.gm },
  ]);
  const count = Math.max(1, Math.ceil(simDt / longest));
  const h = simDt / count;
  for (let i = 0; i < count; i++) {
    stepShip(ship, commands.engines, commands.rcs, h, { field: world.gravityField, t0: 0 });
    world.stepTarget(h);
    world.clock.seconds += h;
    world.refresh();
    events.hazard = checkHazard(body.position, world.moonPosition);
    if (events.hazard) return events;
  }

  // Time warp safety.
  const refBody = world.referenceBody(body.position);
  const refState = world.bodyState(refBody);
  _relative.subVectors(body.position, refState.position);
  _orbital.subVectors(body.velocity, refState.velocity);
  const elements = orbitElements(_relative, _orbital, refBody.gm);
  const inZone = body.position.distanceTo(world.target.position) < TARGET_WARP_ZONE;
  const drop = warpDrop({
    factor: s.warp.factor,
    altitude: _relative.length() - refBody.radius,
    safeAltitude: refBody.warpSafeAltitude,
    periapsisAltitude: elements.periapsisRadius - refBody.radius,
    timeToPeriapsis: elements.timeToPeriapsis,
    enteredTargetZone: inZone && !s.insideTargetZone,
    referenceChanged: refBody !== s.reference,
    controlInput:
      controls.throttle > 0 ||
      [
        controls.pitch,
        controls.yaw,
        controls.roll,
        controls.right,
        controls.up,
        controls.forward,
      ].some((v) => Math.abs(v) > INPUT),
  });
  s.insideTargetZone = inZone;
  s.reference = refBody;
  if (drop) {
    s.warp.limit(drop.factor);
    events.warpDrop = drop.reason;
  }
  return events;
}
