import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createControlState } from '../sim/controls';
import { computeCommands, createFlightCommands, createFlightComputer } from '../sim/flightComputer';
import { createShip, stepShip } from '../sim/ship';
import { placeholderSpacecraft } from '../sim/ships/placeholderSpacecraft';
import { Ephemeris } from './ephemeris';
import { orientationFromForwardUp } from './orbit';
import { SimClock } from './time';
import { World } from './world';

const load = (name: string) => {
  const b = readFileSync(`public/data/${name}.ephem`);
  return new Ephemeris(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

describe('flight assist near a co-orbiting target', () => {
  it('stays quiet at the start: the ship is already at rest in the target frame', () => {
    const world = new World(new SimClock(2461327.5), load('moon'), load('sun'));
    const { ship: start, target } = world.startStates();
    world.target.position.copy(target.position);
    world.target.velocity.copy(target.velocity);
    const ship = createShip(placeholderSpacecraft);
    ship.body.position.copy(start.position);
    ship.body.velocity.copy(start.velocity);
    orientationFromForwardUp(start.velocity, start.position, ship.body.orientation);

    const fc = createFlightComputer('off', true);
    const commands = createFlightCommands();
    const controls = createControlState();
    const reference = new Vector3();
    let thrust = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 120; i++) {
      computeCommands(fc, ship, controls, commands, {
        orbitalVelocity: ship.body.velocity,
        faReference: world.targetFrameVelocity(ship.body.position, reference),
      });
      thrust += commands.rcs.translation.length() + commands.engines.main + commands.engines.retro;
      stepShip(ship, commands.engines, commands.rcs, dt, { field: world.gravityField, t0: 0 });
      world.stepTarget(dt);
      world.clock.seconds += dt;
      world.refresh();
    }
    // Average RCS use under 1 % of one axis, and no engine burns.
    expect(thrust / (120 * 120)).toBeLessThan(0.01);
    expect(ship.body.position.distanceTo(world.target.position)).toBeCloseTo(2000, -1);
  });
});
