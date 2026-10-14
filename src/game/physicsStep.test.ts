import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createControlState } from '../sim/controls';
import { createFlightComputer } from '../sim/flightComputer';
import { createShip } from '../sim/ship';
import { placeholderSpacecraft } from '../sim/ships/placeholderSpacecraft';
import { EARTH } from '../world/bodies';
import { Ephemeris } from '../world/ephemeris';
import { orbitElements, orientationFromForwardUp } from '../world/orbit';
import { SimClock } from '../world/time';
import { World } from '../world/world';
import { createPhysicsState, stepPhysics } from './physicsStep';

const load = (name: string) => {
  const b = readFileSync(`public/data/${name}.ephem`);
  return new Ephemeris(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

function setup() {
  const world = new World(new SimClock(2461327.5), load('moon'), load('sun'));
  const { ship: start, target } = world.startStates();
  world.target.position.copy(target.position);
  world.target.velocity.copy(target.velocity);
  const ship = createShip(placeholderSpacecraft);
  ship.body.position.copy(start.position);
  ship.body.velocity.copy(start.velocity);
  orientationFromForwardUp(start.velocity, start.position, ship.body.orientation);
  const controls = createControlState();
  const state = createPhysicsState(ship, world, createFlightComputer('off', true), controls);
  return { world, ship, controls, state };
}

const DT = 1 / 120;

describe('stepPhysics with time warp', () => {
  it('coasts one orbit at 1000× and stays on the same orbit', () => {
    const { ship, state } = setup();
    for (let i = 0; i < 5; i++) state.warp.up(); // 1000×
    const before = orbitElements(ship.body.position, ship.body.velocity, EARTH.gm);
    let simulated = 0;
    while (simulated < before.period) {
      const events = stepPhysics(state, DT);
      expect(events.hazard).toBeNull();
      simulated += DT * state.warp.factor;
    }
    const after = orbitElements(ship.body.position, ship.body.velocity, EARTH.gm);
    expect(Math.abs(after.semiMajorAxis - before.semiMajorAxis)).toBeLessThan(2000); // the Moon perturbs slightly
    expect(after.eccentricity).toBeLessThan(0.001);
    expect(ship.mainPropellant).toBe(placeholderSpacecraft.mainPropellantCapacity); // coasting: no burns
  });

  it('reduces warp to 4× when the controls are used while coasting', () => {
    const { controls, state } = setup();
    for (let i = 0; i < 4; i++) state.warp.up(); // 100×
    controls.pitch = 1;
    const events = stepPhysics(state, DT);
    expect(events.warpDrop).toBe('control-input');
    expect(state.warp.factor).toBe(4);
  });

  it('drops to 1× when the ship enters the 10 km zone around the target', () => {
    const { ship, world, state } = setup();
    state.insideTargetZone = false; // as if arriving from far away
    state.warp.up();
    state.warp.up(); // 4×
    expect(ship.body.position.distanceTo(world.target.position)).toBeLessThan(10_000);
    const events = stepPhysics(state, DT);
    expect(events.warpDrop).toBe('target');
    expect(state.warp.factor).toBe(1);
  });

  it('drops to 1× before a low pass over Earth', () => {
    const { ship, state } = setup();
    ship.body.velocity.multiplyScalar(0.985); // periapsis now far below 150 km
    for (let i = 0; i < 5; i++) state.warp.up();
    let dropped = null;
    for (let i = 0; i < 120 * 60 && !dropped; i++) dropped = stepPhysics(state, DT).warpDrop;
    expect(dropped).toBe('low-orbit');
    expect(state.warp.factor).toBe(1);
  });
});
