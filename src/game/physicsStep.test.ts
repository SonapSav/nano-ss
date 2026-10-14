import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createControlState } from '../sim/controls';
import { createFlightComputer } from '../sim/flightComputer';
import { createShip } from '../sim/ship';
import { placeholderSpacecraft } from '../sim/ships/placeholderSpacecraft';
import { EARTH, MOON } from '../world/bodies';
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

describe('hyperdrive trips', () => {
  function atEarthFacingMoon(altitude: number) {
    const s = setup();
    const toMoon = s.world.moonPosition.clone().normalize();
    s.ship.body.position.copy(toMoon).multiplyScalar(EARTH.radius + altitude);
    s.ship.body.velocity.set(0, 0, 0);
    orientationFromForwardUp(toMoon, new Vector3(0, 0, 1), s.ship.body.orientation);
    s.ship.body.angularVelocity.set(0, 0, 0);
    return s;
  }

  function fly(s: ReturnType<typeof setup>, throttle: number, maxSeconds: number) {
    s.controls.throttle = throttle;
    s.state.hyper.requestEngage();
    let lowest = Infinity;
    let arrived = false;
    let t = 0;
    for (; t < maxSeconds && !arrived; t += DT) {
      const events = stepPhysics(s.state, DT);
      expect(events.hazard).toBeNull();
      if (s.state.hyper.state === 'active') expect(s.state.warp.factor).toBe(1);
      const moonAltitude = s.ship.body.position.distanceTo(s.world.moonPosition) - MOON.radius;
      lowest = Math.min(lowest, moonAltitude);
      arrived = events.hyper === 'arrived';
    }
    return { arrived, lowest, seconds: t };
  }

  for (const [label, throttle] of [
    ['0.1c', 0],
    ['100c', 1],
  ] as const) {
    it(`flies from Earth to a circular lunar orbit at ${label}`, () => {
      const s = atEarthFacingMoon(1_500_000);
      const trip = fly(s, throttle, 120);
      expect(trip.arrived).toBe(true);
      expect(trip.seconds).toBeLessThan(60);
      expect(trip.lowest).toBeGreaterThan(MOON.hyperAltitude - 1_000);
      const rel = s.ship.body.position.clone().sub(s.world.moonPosition);
      const vel = s.ship.body.velocity.clone().sub(s.world.moonVelocity);
      const el = orbitElements(rel, vel, MOON.gm);
      expect(el.eccentricity).toBeLessThan(1e-6);
      expect((el.periapsisRadius - MOON.radius) / 1000).toBeCloseTo(100, -1);
    });
  }

  it('cannot engage from the 400 km start orbit', () => {
    const s = setup();
    s.state.hyper.requestEngage();
    expect(stepPhysics(s.state, DT).hyper).toBe('blocked');
  });

  it('drops out mid-trip into a circular orbit around Earth', () => {
    const s = atEarthFacingMoon(1_500_000);
    s.controls.throttle = 0;
    s.state.hyper.requestEngage();
    for (let t = 0; t < 6; t += DT) stepPhysics(s.state, DT); // charge and start
    for (let t = 0; t < 2; t += DT) stepPhysics(s.state, DT); // about 60,000 km out
    s.state.hyper.requestDrop();
    expect(stepPhysics(s.state, DT).hyper).toBe('dropped');
    const el = orbitElements(s.ship.body.position, s.ship.body.velocity, EARTH.gm);
    expect(el.eccentricity).toBeLessThan(1e-3);
  });
});
