import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createShip, G0, mainDeltaV, shipMass, stepShip, type RcsCommand } from './ship';
import { placeholderSpaceplane } from './ships/placeholderSpaceplane';

const DT = 1 / 120;
const noRcs = (): RcsCommand => ({ rotation: new Vector3(), translation: new Vector3() });

describe('stepShip', () => {
  it('reaches the Tsiolkovsky delta-v when burning to empty', () => {
    const ship = createShip(placeholderSpaceplane);
    const expected = mainDeltaV(ship);
    const rcs = noRcs();
    for (let i = 0; i < 120 * 400 && ship.mainPropellant > 0; i++) stepShip(ship, 1, rcs, DT);

    expect(ship.mainPropellant).toBe(0);
    // Forward is -Z, and the ship never rotated.
    expect(-ship.body.velocity.z).toBeCloseTo(expected, 0);
    expect(Math.abs(-ship.body.velocity.z - expected) / expected).toBeLessThan(1e-4);
  });

  it('stops thrusting when the tank is empty', () => {
    const ship = createShip(placeholderSpaceplane);
    ship.mainPropellant = 0;
    stepShip(ship, 1, noRcs(), DT);
    expect(ship.appliedThrottle).toBe(0);
    expect(ship.body.velocity.length()).toBe(0);
  });

  it('burns propellant at thrust / (Isp·g0)', () => {
    const ship = createShip(placeholderSpaceplane);
    const before = ship.mainPropellant;
    for (let i = 0; i < 120; i++) stepShip(ship, 0.5, noRcs(), DT);
    const { thrust, isp } = placeholderSpaceplane.mainEngine;
    expect(before - ship.mainPropellant).toBeCloseTo((0.5 * thrust) / (isp * G0), 6);
  });

  it('translates with RCS and uses RCS propellant', () => {
    const ship = createShip(placeholderSpaceplane);
    const rcs = noRcs();
    rcs.translation.set(1, 0, 0);
    const mass = shipMass(ship);
    for (let i = 0; i < 120; i++) stepShip(ship, 0, rcs, DT);
    expect(ship.body.velocity.x).toBeCloseTo(placeholderSpaceplane.rcs.force / mass, 3);
    expect(ship.rcsPropellant).toBeLessThan(placeholderSpaceplane.rcsPropellantCapacity);
  });
});
