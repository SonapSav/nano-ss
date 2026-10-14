import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createControlState } from '../sim/controls';
import { createFlightComputer } from '../sim/flightComputer';
import { createShip } from '../sim/ship';
import { placeholderSpacecraft } from '../sim/ships/placeholderSpacecraft';
import { MOON } from '../world/bodies';
import { Ephemeris } from '../world/ephemeris';
import { orientationFromForwardUp } from '../world/orbit';
import { Site } from '../world/terrain';
import { SimClock } from '../world/time';
import { World } from '../world/world';
import { commandStop } from '../sim/flightComputer';
import { computeGuidance, predictImpact } from './guidance';
import { createPhysicsState, stepPhysics, type StepEvents } from './physicsStep';

const load = (name: string) => {
  const b = readFileSync(`public/data/${name}.ephem`);
  return new Ephemeris(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

/** A flat spaceport at 0°N 0°E (the pad itself is flattened; detail bumps lie beyond it). */
function flatSite(): Site {
  return new Site({
    name: 'test',
    centerLat: 0,
    centerLon: 0,
    size: 101,
    halfExtent: 20_000,
    heights: new Float32Array(101 * 101),
    ringSize: 50,
    ringHalfExtent: 200_000,
    ringHeights: new Float32Array(50 * 50),
    padX: 0,
    padY: 0,
  });
}

const DT = 1 / 120;
/** Footpads sit this far below the centre of mass, tail down (m). */
const FOOT_DEPTH = 5.04;

/** Ship tail-down over the pad, `offset` m east of its centre, feet `clearance` m above the ground, sinking at `speed`. */
function setup(speed: number, offset = 0, clearance = 0.01) {
  const world = new World(new SimClock(2461327.5), load('moon'), load('sun'));
  const site = flatSite();
  world.spaceports = [{ name: 'test', title: 'Test', site }];
  const ship = createShip(placeholderSpacecraft);
  const surface = site.surfacePoint(offset, 0, new Vector3());
  const up = surface.clone().normalize();
  const local = surface.addScaledVector(up, FOOT_DEPTH + clearance);
  world.moonFrame.toWorld(local, ship.body.position);
  world.moonFrame.groundVelocity(ship.body.position, ship.body.velocity);
  const upWorld = up.clone().applyQuaternion(world.moonFrame.orientation);
  ship.body.velocity.addScaledVector(upWorld, -speed);
  const north = site.north.clone().applyQuaternion(world.moonFrame.orientation);
  orientationFromForwardUp(upWorld, north, ship.body.orientation);
  const controls = createControlState();
  const state = createPhysicsState(ship, world, createFlightComputer('off', true), controls);
  return { world, ship, controls, state, site };
}

/** Steps for `seconds`, collecting events; stops at the first hazard. */
function run(state: ReturnType<typeof setup>['state'], seconds: number) {
  const landing: NonNullable<StepEvents['landing']>[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const e = stepPhysics(state, DT);
    if (e.landing) landing.push(e.landing);
    if (e.hazard) return { landing, hazard: e.hazard };
  }
  return { landing, hazard: null };
}

describe('Landing', () => {
  it('lands safely at 1.5 m/s, settles on four feet, and attaches to the ground', () => {
    const { state } = setup(1.5);
    const result = run(state, 6);
    expect(result.hazard).toBeNull();
    expect(result.landing.slice(0, 2)).toEqual(['touchdown-safe', 'landed']);
    expect(state.landing.touchdown?.verdict).toBe('safe');
    expect(state.landing.phase).toBe('landed');
    expect(state.landing.legsDamaged).toBe(false);
  });

  it('damages the legs at 3 m/s, and a crash beyond 5 m/s says why', () => {
    const hard = setup(3);
    expect(run(hard.state, 6).landing[0]).toBe('touchdown-hard');
    expect(hard.state.landing.legsDamaged).toBe(true);

    const fast = setup(6);
    const crash = run(fast.state, 2).hazard;
    expect(crash).toMatchObject({ kind: 'crashed', body: 'Moon' });
    expect(crash && 'detail' in crash ? crash.detail : '').toMatch(/touched down at 6/);
  });

  it('collapses damaged legs on a second hard landing', () => {
    const { state, ship, world } = setup(3);
    run(state, 0.5);
    // Back up 5 m and down again at 3 m/s.
    const up = ship.body.position.clone().sub(world.moonPosition).normalize();
    state.landing.phase = 'flying';
    state.landing.airborne = Infinity;
    ship.body.position.addScaledVector(up, 1);
    world.moonFrame.groundVelocity(ship.body.position, ship.body.velocity);
    ship.body.velocity.addScaledVector(up, -3);
    const crash = run(state, 2).hazard;
    expect(crash && 'detail' in crash ? crash.detail : '').toMatch(/legs collapsed/);
  });

  it('refuels and repairs on the pad, but not 40 m away', () => {
    const onPad = setup(3);
    onPad.ship.mainPropellant = 1000;
    onPad.ship.rcsPropellant = 100;
    const events = run(onPad.state, 18).landing;
    expect(events).toContain('serviced');
    expect(onPad.ship.mainPropellant).toBe(placeholderSpacecraft.mainPropellantCapacity);
    expect(onPad.ship.rcsPropellant).toBe(placeholderSpacecraft.rcsPropellantCapacity);
    expect(onPad.state.landing.legsDamaged).toBe(false);

    const offPad = setup(1, 40);
    offPad.ship.mainPropellant = 1000;
    expect(run(offPad.state, 18).landing).not.toContain('serviced');
    expect(offPad.state.landing.phase).toBe('landed');
    expect(offPad.ship.mainPropellant).toBeLessThan(1001);
  });

  it('stays put on the ground for a day at 1000× warp, then lifts off on throttle', () => {
    const { state, ship, world } = setup(1);
    run(state, 6);
    expect(state.landing.phase).toBe('landed');
    const local = world.moonFrame.toLocal(ship.body.position, new Vector3());
    for (let i = 0; i < 5; i++) state.warp.up();
    expect(state.warp.factor).toBe(1000);
    run(state, 86_400 / 1000);
    expect(state.warp.factor).toBe(1000);
    expect(state.landing.phase).toBe('landed');
    expect(
      world.moonFrame.toLocal(ship.body.position, new Vector3()).distanceTo(local),
    ).toBeLessThan(0.01);

    state.warp.limit(1);
    state.controls.throttle = 1;
    const events = run(state, 2).landing;
    expect(events[0]).toBe('liftoff');
    expect(state.landing.phase).not.toBe('landed');
    expect(
      world.moonFrame.toLocal(ship.body.position, new Vector3()).distanceTo(local),
    ).toBeGreaterThan(2);
  });

  it('hovers with FA on and throttle cut, and descends at a set cruise rate to a safe landing', () => {
    const { state, ship, world } = setup(0, 0, 100);
    state.fc.fa = true;
    commandStop(state.fc);
    const height = () => world.moonGroundAltitude(ship.body.position) - FOOT_DEPTH;
    run(state, 20);
    expect(height()).toBeGreaterThan(95);
    expect(height()).toBeLessThan(101);
    // Nose up: forward is up, so a cruise of -2 m/s is a 2 m/s descent.
    state.fc.cruise = -2;
    const result = run(state, 70);
    expect(result.hazard).toBeNull();
    expect(result.landing[0]).toBe('touchdown-safe');
    expect(state.landing.touchdown?.vertical).toBeGreaterThan(1.5);
    expect(state.landing.touchdown?.vertical).toBeLessThan(2.2);
    // FA stays on, yet lets the ship settle.
    run(state, 6);
    expect(state.landing.phase).toBe('landed');
  });
});

describe('Guidance', () => {
  it('predicts where a falling ship hits the ground', () => {
    const { ship, world, site } = setup(0, 0, 1000);
    const local = new Vector3();
    const time = predictImpact(world, ship.body.position, ship.body.velocity, local);
    // Free fall from about 1005 m at 1.62 m/s²: about 35 s, straight down onto the pad.
    expect(time).toBeGreaterThan(33);
    expect(time).toBeLessThan(37);
    expect(local.distanceTo(site.padPoint(new Vector3()))).toBeLessThan(5);
  });

  it('finds no impact from a circular orbit, and gives pad distance, bearing and radar height', () => {
    const { ship, world, state } = setup(0, 3000, 50);
    const port = world.spaceports[0];
    if (!port) throw new Error('no port');
    const g = computeGuidance(world, port, ship.body.position, ship.body.velocity);
    expect(g.surfaceDistance).toBeCloseTo(3000, -1);
    expect(g.bearing).toBeCloseTo(270, 0); // the pad is due west
    expect(g.radarAltitude).toBeCloseTo(50, 0);
    expect(g.impact).not.toBeNull();

    // 100 km circular orbit over the Moon.
    const rel = ship.body.position.clone().sub(world.moonPosition);
    rel.setLength(MOON.radius + 100_000);
    ship.body.position.copy(world.moonPosition).add(rel);
    const along = new Vector3(0, 0, 1)
      .cross(rel)
      .normalize()
      .multiplyScalar(Math.sqrt(MOON.gm / (MOON.radius + 100_000)));
    ship.body.velocity.copy(world.moonVelocity).add(along);
    expect(predictImpact(world, ship.body.position, ship.body.velocity, new Vector3())).toBeNull();
    expect(state.landing.phase).toBe('flying');
  });
});
