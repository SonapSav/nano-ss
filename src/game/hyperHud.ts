import { Vector3, type Quaternion } from 'three/webgpu';
import type { HudHyper } from '../ui/hud';
import { duration } from '../ui/hud';
import { BANDS, C, bandFromThrottle, blockingBody, timeToArrival } from '../world/hyperdrive';
import type { World } from '../world/world';
import { bodiesNow, type HyperEvent, type PhysicsState } from './physicsStep';

const km = (m: number) => `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })} km`;

/** Messages shown under TIME when the hyperdrive changes state. */
export const HYPER_MESSAGES: Partial<
  Record<HyperEvent, (world: World, position: Vector3) => string>
> = {
  blocked: (world, position) => {
    const b = blockingBody(position, bodiesNow(world));
    return b
      ? `Hyperdrive blocked: climb above ${km(b.info.hyperAltitude)} over ${b.info.name}`
      : 'Hyperdrive blocked';
  },
  charging: () => 'Hyperdrive charging: hold course',
  aborted: () => 'Hyperdrive charge aborted',
  engaged: () => 'Hyperdrive engaged: steer with the stick, throttle picks the band',
  arrived: (world, position) => {
    const body = world.referenceBody(position);
    return `Arrived: circular orbit around the ${body.name} at ${km(position.distanceTo(world.bodyState(body).position) - body.radius)}`;
  },
  dropped: () => 'Dropped out: circular orbit around the nearest body',
};

const _heading = new Vector3();

/** Hyperdrive data for the HUD's HYPER line. */
export function hyperHud(
  s: PhysicsState,
  world: World,
  position: Vector3,
  orientation: Quaternion,
  throttle: number,
): HudHyper {
  const bodies = bodiesNow(world);
  const band = BANDS[bandFromThrottle(throttle)] ?? 0.1;
  const blocked = blockingBody(position, bodies);
  let arrival: string | null = null;
  if (s.hyper.state === 'active') {
    _heading.set(0, 0, -1).applyQuaternion(orientation);
    const ahead = timeToArrival(position, _heading, Math.max(s.hyper.speed, 1), bodies);
    if (ahead) arrival = `${ahead.body.info.name} in ${duration(ahead.seconds)}`;
  }
  return {
    state: s.hyper.state,
    chargeRemaining: Math.max(0, s.hyper.chargeRemaining),
    band,
    speed: s.hyper.speed / C,
    blocked: blocked ? `${blocked.info.name}: climb above ${km(blocked.info.hyperAltitude)}` : null,
    arrival,
  };
}
