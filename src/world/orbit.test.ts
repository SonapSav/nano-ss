import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { EARTH, MOON, MOON_SOI } from './bodies';
import {
  checkHazard,
  circularSpeed,
  gravity,
  integratePoint,
  leoStartState,
  orbitElements,
  orientationFromForwardUp,
  sunlitPhase,
  type AccelerationField,
} from './orbit';

const FAR_MOON = new Vector3(1e15, 0, 0); // effectively no Moon
const earthOnly: AccelerationField = (_t, p, out) => gravity(p, FAR_MOON, out);
const energy = (s: { position: Vector3; velocity: Vector3 }) =>
  s.velocity.lengthSq() / 2 - EARTH.gm / s.position.length();

describe('orbits around Earth', () => {
  it('keeps a 400 km circular orbit circular for 10 orbits (1 s steps, coarser than the 1/120 s physics step)', () => {
    const state = leoStartState();
    const r0 = state.position.length();
    const e0 = energy(state);
    const period = orbitElements(state.position, state.velocity, EARTH.gm).period;
    let minR = Infinity;
    let maxR = 0;
    for (let t = 0; t < 10 * period; t += 1) {
      integratePoint(state, earthOnly, t, 1);
      const r = state.position.length();
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
    expect((maxR - minR) / r0).toBeLessThan(1e-3);
    expect(Math.abs((energy(state) - e0) / e0)).toBeLessThan(1e-6);
  });

  it('gives a 92-minute period at 400 km', () => {
    const s = leoStartState();
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    expect(el.period / 60).toBeCloseTo(92.4, 0);
    expect(el.eccentricity).toBeLessThan(1e-9);
    expect((el.inclination * 180) / Math.PI).toBeCloseTo(51.6, 6);
  });

  it('a prograde burn raises the apoapsis on the far side', () => {
    const s = leoStartState();
    s.velocity.multiplyScalar(1 + 100 / s.velocity.length()); // +100 m/s
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    expect(el.periapsisRadius - EARTH.radius).toBeCloseTo(400_000, -3);
    expect(el.apoapsisRadius - EARTH.radius).toBeGreaterThan(700_000);
    expect(el.timeToApoapsis).toBeCloseTo(el.period / 2, -1);
  });

  it('recognizes escape orbits', () => {
    const s = leoStartState();
    s.velocity.setLength(Math.SQRT2 * circularSpeed(EARTH.gm, s.position.length()) * 1.01);
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    expect(el.eccentricity).toBeGreaterThan(1);
    expect(el.apoapsisRadius).toBe(Infinity);
    expect(el.period).toBeNaN();
  });

  it('places the co-orbiting target 2 km ahead along the same orbit', () => {
    const r = EARTH.radius + 400_000;
    const ship = leoStartState();
    const target = leoStartState(400_000, 51.6, 2000 / r);
    expect(target.position.distanceTo(ship.position)).toBeCloseTo(2000, 0);
    expect(
      target.position.clone().sub(ship.position).normalize().dot(ship.velocity.clone().normalize()),
    ).toBeGreaterThan(0.999);
  });
});

describe('sunlitPhase', () => {
  it('starts the orbit on the Sun side of Earth', () => {
    const sun = new Vector3(-1.4e11, -4.75e10, -2.06e10); // 2026-10-14
    const start = leoStartState(400_000, 51.6, sunlitPhase(sun));
    expect(start.position.clone().normalize().dot(sun.clone().normalize())).toBeGreaterThan(0.8);
  });
});

describe('gravity', () => {
  it('includes the Moon: near the Moon, the Moon dominates', () => {
    const moon = new Vector3(384_400_000, 0, 0);
    const nearMoon = new Vector3(384_400_000 - (MOON.radius + 100_000), 0, 0);
    const a = gravity(nearMoon, moon, new Vector3());
    expect(a.x).toBeGreaterThan(1); // toward the Moon (+x), about 1.4 m/s²
  });

  it('puts the Moon sphere of influence near 66,000 km', () => {
    expect(MOON_SOI / 1000).toBeGreaterThan(60_000);
    expect(MOON_SOI / 1000).toBeLessThan(70_000);
  });
});

describe('hazards and orientation', () => {
  const moon = new Vector3(384_400_000, 0, 0);
  it('burns up below 100 km over Earth and crashes into the Moon', () => {
    expect(checkHazard(new Vector3(EARTH.radius + 99_000, 0, 0), moon)).toEqual({
      kind: 'burned-up',
      body: 'Earth',
    });
    expect(checkHazard(new Vector3(EARTH.radius + 101_000, 0, 0), moon)).toBeNull();
    expect(checkHazard(new Vector3(384_400_000 - MOON.radius + 10, 0, 0), moon)).toEqual({
      kind: 'crashed',
      body: 'Moon',
    });
  });

  it('builds an orientation with the nose forward and the roof up', () => {
    const q = orientationFromForwardUp(
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 0),
      new Quaternion(),
    );
    expect(new Vector3(0, 0, -1).applyQuaternion(q).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(
      1e-9,
    );
    expect(new Vector3(0, 1, 0).applyQuaternion(q).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(
      1e-9,
    );
  });
});
