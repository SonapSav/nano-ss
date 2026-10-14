import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { EARTH, MOON } from './bodies';
import {
  BANDS,
  C,
  CHARGE_TIME,
  Hyperdrive,
  bandFromThrottle,
  blockingBody,
  circularOrbitVelocity,
  governedSpeed,
  type BodyNow,
} from './hyperdrive';
import { orbitElements } from './orbit';

const earth: BodyNow = { info: EARTH, position: new Vector3(), velocity: new Vector3() };
const moon: BodyNow = {
  info: MOON,
  position: new Vector3(384_400_000, 0, 0),
  velocity: new Vector3(0, 1022, 0),
};
const bodies = [earth, moon];

describe('bands and charge', () => {
  it('picks the band from throttle quarters', () => {
    expect([0, 0.2, 0.3, 0.6, 0.8, 1].map(bandFromThrottle)).toEqual([0, 0, 1, 2, 3, 3]);
    expect(BANDS[bandFromThrottle(1)]).toBe(100);
  });

  it('charges for 5 s, then engages; drop-out aborts charging', () => {
    const drive = new Hyperdrive();
    drive.requestEngage();
    expect(drive.update(0.1, false)).toBe('charging');
    let result = null;
    for (let t = 0; t < CHARGE_TIME + 0.2 && result === null; t += 0.1)
      result = drive.update(0.1, false);
    expect(result).toBe('engaged');
    expect(drive.state).toBe('active');

    const other = new Hyperdrive();
    other.requestEngage();
    other.update(0.1, false);
    other.requestDrop();
    expect(other.update(0.1, false)).toBe('aborted');
    expect(other.state).toBe('idle');
  });

  it('refuses to start, or stops charging, inside a gravity well', () => {
    const drive = new Hyperdrive();
    drive.requestEngage();
    expect(drive.update(0.1, true)).toBe('blocked');
    drive.requestEngage();
    drive.update(0.1, false);
    expect(drive.update(0.1, true)).toBe('aborted');
  });
});

describe('gravity wells', () => {
  it('blocks below 1,000 km over Earth and 100 km over the Moon', () => {
    expect(blockingBody(new Vector3(EARTH.radius + 400_000, 0, 0), bodies)?.info).toBe(EARTH);
    expect(blockingBody(new Vector3(EARTH.radius + 1_100_000, 0, 0), bodies)).toBeNull();
    const nearMoon = new Vector3(384_400_000 - MOON.radius - 50_000, 0, 0);
    expect(blockingBody(nearMoon, bodies)?.info).toBe(MOON);
  });
});

describe('governor', () => {
  const start = new Vector3(EARTH.radius + 1_500_000, 0, 0);
  const towardMoon = new Vector3(1, 0, 0);

  it('does not limit leaving a body', () => {
    // Heading away from Earth, far from the Moon.
    expect(governedSpeed(start, towardMoon, 100 * C, bodies)).toBeGreaterThan(1e6);
  });

  it('slows the approach as the drop-out altitude gets closer', () => {
    const far = governedSpeed(new Vector3(300_000_000, 0, 0), towardMoon, 0.1 * C, bodies);
    const near = governedSpeed(
      new Vector3(384_400_000 - MOON.radius - 200_000, 0, 0),
      towardMoon,
      0.1 * C,
      bodies,
    );
    expect(far).toBeCloseTo(0.1 * C, -3);
    expect(near).toBeLessThan(60_000);
    expect(near).toBeGreaterThanOrEqual(2_000);
  });

  it('barely limits a pass that is mostly sideways', () => {
    const passing = new Vector3(384_400_000, -50_000_000, 0);
    const sideways = new Vector3(1, 0.02, 0).normalize();
    expect(governedSpeed(passing, sideways, 0.1 * C, bodies)).toBeGreaterThan(0.09 * C);
  });
});

describe('arrival orbit', () => {
  for (const [name, heading] of [
    ['heading past the Moon', new Vector3(1, 0.3, 0.1).normalize()],
    ['heading straight at the Moon', new Vector3(1, 0, 0)],
  ] as const) {
    it(`is circular around the Moon at the drop-out altitude when ${name}`, () => {
      const position = new Vector3(384_400_000 - MOON.radius - 100_000, 0, 0);
      const v = circularOrbitVelocity(position, heading, moon, new Vector3());
      const el = orbitElements(position.clone().sub(moon.position), v.sub(moon.velocity), MOON.gm);
      expect(el.eccentricity).toBeLessThan(1e-9);
      expect(el.periapsisRadius - MOON.radius).toBeCloseTo(100_000, -1);
    });
  }

  it('passes over a given point (a targeted pad), heading toward it', () => {
    const position = new Vector3(384_400_000 - MOON.radius - 100_000, 0, 0);
    const pad = new Vector3(0.3, -0.6, 0.74).normalize().multiplyScalar(MOON.radius);
    const v = circularOrbitVelocity(position, new Vector3(1, 0.3, 0.1), moon, new Vector3(), pad);
    const relative = position.clone().sub(moon.position);
    const normal = relative.clone().cross(v.clone().sub(moon.velocity)).normalize();
    expect(Math.abs(normal.dot(pad.clone().normalize()))).toBeLessThan(1e-9);
    // Moving toward the pad: its direction has a positive component along the velocity.
    expect(v.clone().sub(moon.velocity).dot(pad)).toBeGreaterThan(0);
    const el = orbitElements(relative, v.sub(moon.velocity), MOON.gm);
    expect(el.eccentricity).toBeLessThan(1e-9);
  });
});
