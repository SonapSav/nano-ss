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
}

export interface StepEvents {
  hazard: Hazard | null;
  warpDrop: WarpDropReason | null;
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
  };
}

const _orbital = new Vector3();
const _faReference = new Vector3();
const _relative = new Vector3();

/**
 * Advances the game by one physics step of `realDt` seconds of real time:
 * `realDt × warp` of simulated time, split into substeps short enough for
 * accurate orbits. Above 4× warp the ship coasts (no engines or RCS).
 */
export function stepPhysics(s: PhysicsState, realDt: number): StepEvents {
  const { ship, world, fc, controls, commands } = s;
  const events: StepEvents = { hazard: null, warpDrop: null };
  const body = ship.body;

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
