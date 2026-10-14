import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createShip, G0, mainDeltaV, resetShip, shipMass, stepShip, type RcsCommand } from './ship';
import { placeholderSpacecraft } from './ships/placeholderSpacecraft';

const DT = 1 / 120;
const noRcs = (): RcsCommand => ({ rotation: new Vector3(), translation: new Vector3() });

describe('stepShip', () => {
  it('reaches the Tsiolkovsky delta-v when burning to empty', () => {
    const ship = createShip(placeholderSpacecraft);
    const expected = mainDeltaV(ship);
    const rcs = noRcs();
    for (let i = 0; i < 120 * 400 && ship.mainPropellant > 0; i++)
      stepShip(ship, { main: 1, retro: 0 }, rcs, DT);

    expect(ship.mainPropellant).toBe(0);
    // Forward is -Z, and the ship never rotated.
    expect(-ship.body.velocity.z).toBeCloseTo(expected, 0);
    expect(Math.abs(-ship.body.velocity.z - expected) / expected).toBeLessThan(1e-4);
  });

  it('stops thrusting when the tank is empty', () => {
    const ship = createShip(placeholderSpacecraft);
    ship.mainPropellant = 0;
    stepShip(ship, { main: 1, retro: 0 }, noRcs(), DT);
    expect(ship.appliedThrottle).toBe(0);
    expect(ship.body.velocity.length()).toBe(0);
  });

  it('burns propellant at thrust / (Isp·g0)', () => {
    const ship = createShip(placeholderSpacecraft);
    const before = ship.mainPropellant;
    for (let i = 0; i < 120; i++) stepShip(ship, { main: 0.5, retro: 0 }, noRcs(), DT);
    const { thrust, isp } = placeholderSpacecraft.mainEngine;
    expect(before - ship.mainPropellant).toBeCloseTo((0.5 * thrust) / (isp * G0), 6);
  });

  it('translates with RCS and uses RCS propellant', () => {
    const ship = createShip(placeholderSpacecraft);
    const rcs = noRcs();
    rcs.translation.set(1, 0, 0);
    const mass = shipMass(ship);
    for (let i = 0; i < 120; i++) stepShip(ship, { main: 0, retro: 0 }, rcs, DT);
    expect(ship.body.velocity.x).toBeCloseTo(placeholderSpacecraft.rcs.force / mass, 3);
    expect(ship.rcsPropellant).toBeLessThan(placeholderSpacecraft.rcsPropellantCapacity);
  });

  it('brakes with the retro engines, fed from the main tank', () => {
    const ship = createShip(placeholderSpacecraft);
    ship.body.velocity.set(0, 0, -50); // moving forward at 50 m/s
    const tank = ship.mainPropellant;
    const mass = shipMass(ship);
    for (let i = 0; i < 120; i++) stepShip(ship, { main: 0, retro: 1 }, noRcs(), DT);
    const expected = 50 - placeholderSpacecraft.retroEngine.thrust / mass;
    expect(-ship.body.velocity.z).toBeCloseTo(expected, 1);
    expect(ship.mainPropellant).toBeLessThan(tank);
    expect(ship.appliedRetro).toBe(1);
  });

  it('cannot fire either engine with an empty main tank', () => {
    const ship = createShip(placeholderSpacecraft);
    ship.mainPropellant = 0;
    stepShip(ship, { main: 1, retro: 1 }, noRcs(), DT);
    expect(ship.appliedThrottle).toBe(0);
    expect(ship.appliedRetro).toBe(0);
  });

  it('reset refills the tanks and returns the ship to the start at rest', () => {
    const ship = createShip(placeholderSpacecraft);
    const rcs = noRcs();
    rcs.rotation.set(1, 0, 0);
    rcs.translation.set(0, 1, 0);
    for (let i = 0; i < 600; i++) stepShip(ship, { main: 1, retro: 0 }, rcs, DT);
    resetShip(ship);
    const fresh = createShip(placeholderSpacecraft);
    expect(ship.body).toEqual(fresh.body);
    expect(ship.mainPropellant).toBe(fresh.mainPropellant);
    expect(ship.rcsPropellant).toBe(fresh.rcsPropellant);
  });
});
