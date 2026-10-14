import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { FEET, contactForces, judgeTouchdown, type GroundProbe } from './contact';
import { createShip, shipMass, stepShip } from './ship';
import { placeholderSpacecraft } from './ships/placeholderSpacecraft';

const G = 1.62;
const DT = 1 / 120;

/** A still ground plane through the origin with upward normal `n`, gravity along -Z. */
function plane(slopeDeg: number): GroundProbe {
  const a = (slopeDeg * Math.PI) / 180;
  const n = new Vector3(Math.sin(a), 0, Math.cos(a));
  return (point, normal, velocity) => {
    normal.copy(n);
    velocity.set(0, 0, 0);
    return point.dot(n) / n.z; // height along the vertical
  };
}

/** Upright ship (nose up along +Z), feet `clearance` m above the plane at x = 0. */
function standing(clearance: number) {
  const ship = createShip(placeholderSpacecraft);
  // Body -Z (nose) to world +Z.
  ship.body.orientation.setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(0, 0, 1));
  ship.body.position.set(0, 0, 5.04 + clearance);
  return ship;
}

/** Simulates under lunar gravity with the contacts; returns the ship's tilt from vertical (degrees). */
function simulate(ship: ReturnType<typeof standing>, probe: GroundProbe, seconds: number) {
  const force = new Vector3();
  const torque = new Vector3();
  const none = { main: 0, retro: 0 };
  const rcs = { rotation: new Vector3(), translation: new Vector3() };
  let maxFeet = 0;
  for (let t = 0; t < seconds; t += DT) {
    const r = contactForces(ship.body, shipMass(ship), probe, force, torque);
    maxFeet = Math.max(maxFeet, r.feet);
    force.z -= shipMass(ship) * G;
    stepShip(ship, none, rcs, DT, undefined, { force, torque });
  }
  const nose = new Vector3(0, 0, -1).applyQuaternion(ship.body.orientation);
  return { tilt: (Math.acos(nose.z) * 180) / Math.PI, maxFeet };
}

describe('Touchdown judgement', () => {
  it('follows the realistic limits', () => {
    expect(judgeTouchdown(2, 0.5, 5)).toBe('safe');
    expect(judgeTouchdown(3, 0.5, 5)).toBe('hard');
    expect(judgeTouchdown(1, 1.5, 5)).toBe('hard');
    expect(judgeTouchdown(1, 0.5, 15)).toBe('hard');
    expect(judgeTouchdown(6, 0.5, 5)).toBe('crash');
    expect(judgeTouchdown(1, 3, 5)).toBe('crash');
    expect(judgeTouchdown(1, 0.5, 25)).toBe('crash');
  });
});

describe('Leg contacts', () => {
  it('settle the ship on four feet, legs compressed by its weight', () => {
    const ship = standing(0.05);
    const { tilt } = simulate(ship, plane(0), 5);
    expect(tilt).toBeLessThan(0.5);
    expect(ship.body.velocity.length()).toBeLessThan(0.01);
    const compression = (shipMass(ship) * G) / FEET.length / 2e5;
    expect(5.04 - ship.body.position.z).toBeCloseTo(compression, 3);
  });

  it('hold the ship on a gentle slope but tip it over on 25°', () => {
    // Clearance so the downhill feet start just above the slope.
    expect(simulate(standing(0.2), plane(5), 10).tilt).toBeLessThan(10);
    expect(simulate(standing(0.9), plane(25), 10).tilt).toBeGreaterThan(60);
  });

  it('report a hull strike when the ship lies on its side', () => {
    const ship = createShip(placeholderSpacecraft);
    // Nose horizontal (body -Z turned to world +Y).
    ship.body.orientation.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    ship.body.position.set(0, 0, 1);
    const r = contactForces(ship.body, shipMass(ship), plane(0), new Vector3(), new Vector3());
    expect(r.hullStrike).toBe(true);
    expect(
      contactForces(standing(0.05).body, 18_800, plane(0), new Vector3(), new Vector3()).hullStrike,
    ).toBe(false);
  });
});
