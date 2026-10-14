import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { EARTH, MOON } from './bodies';
import { Ephemeris } from './ephemeris';
import { SimClock } from './time';
import { World } from './world';

const load = (name: string) => {
  const b = readFileSync(`public/data/${name}.ephem`);
  return new Ephemeris(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

describe('World', () => {
  const world = new World(new SimClock(2461327.5), load('moon'), load('sun'));

  it('places the Moon about 384,000 km away and the Sun about 1 AU away', () => {
    expect(world.moonPosition.length() / 1000).toBeGreaterThan(356_000);
    expect(world.moonPosition.length() / 1000).toBeLessThan(407_000);
    expect(world.sunPosition.length() / 1.496e11).toBeCloseTo(1, 1);
  });

  it('switches the reference body inside the Moon sphere of influence', () => {
    expect(world.referenceBody(new Vector3(EARTH.radius + 400_000, 0, 0))).toBe(EARTH);
    const nearMoon = world.moonPosition.clone().multiplyScalar(0.99);
    expect(world.referenceBody(nearMoon)).toBe(MOON);
  });

  it('starts the ship in daylight with the target 2 km ahead', () => {
    const { ship, target } = world.startStates();
    expect(
      ship.position.clone().normalize().dot(world.sunPosition.clone().normalize()),
    ).toBeGreaterThan(0.8);
    expect(target.position.distanceTo(ship.position)).toBeCloseTo(2000, 0);
  });

  it('sees a ship on the same orbit as at rest in the target frame', () => {
    const { ship, target } = world.startStates();
    world.target.position.copy(target.position);
    world.target.velocity.copy(target.velocity);
    // In a fixed frame they differ by about 2.3 m/s; in the target's orbiting frame by almost nothing.
    expect(ship.velocity.distanceTo(target.velocity)).toBeGreaterThan(2);
    const frame = world.targetFrameVelocity(ship.position, new Vector3());
    expect(ship.velocity.distanceTo(frame)).toBeLessThan(1e-3);
  });

  it('keeps the target on its orbit', () => {
    const start = world.startStates().target;
    world.target.position.copy(start.position);
    world.target.velocity.copy(start.velocity);
    const r0 = world.target.position.length();
    for (let i = 0; i < 600; i++) world.stepTarget(1);
    expect(Math.abs(world.target.position.length() - r0)).toBeLessThan(50);
  });
});
