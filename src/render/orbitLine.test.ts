import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { EARTH } from '../world/bodies';
import { leoStartState, orbitElements } from '../world/orbit';
import { apsides, orbitPoints } from './orbitLine';

describe('orbitPoints', () => {
  it('draws an elliptic orbit: every point on the conic, in the orbit plane', () => {
    const s = leoStartState();
    s.velocity.multiplyScalar(1.05);
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    const out = new Float32Array(360 * 3);
    orbitPoints(el, 1e9, out);
    const n = el.hVector.clone().normalize();
    for (let i = 0; i < 360; i++) {
      const p = new Vector3(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(p.length()).toBeGreaterThanOrEqual(el.periapsisRadius * 0.9999);
      expect(p.length()).toBeLessThanOrEqual(el.apoapsisRadius * 1.0001);
      expect(Math.abs(p.clone().normalize().dot(n))).toBeLessThan(1e-6);
    }
  });

  it('passes through the ship', () => {
    const s = leoStartState();
    s.velocity.multiplyScalar(1.02);
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    const out = new Float32Array(3600 * 3);
    orbitPoints(el, 1e9, out);
    let nearest = Infinity;
    for (let i = 0; i < 3600; i++) {
      nearest = Math.min(
        nearest,
        s.position.distanceTo(new Vector3(out[i * 3], out[i * 3 + 1], out[i * 3 + 2])),
      );
    }
    expect(nearest).toBeLessThan(10_000); // within 10 km at 0.1° spacing
  });

  it('stops escape orbits at the maximum radius', () => {
    const s = leoStartState();
    s.velocity.multiplyScalar(1.5);
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    const out = new Float32Array(100 * 3);
    orbitPoints(el, 5e7, out);
    const first = new Vector3(out[0], out[1], out[2]);
    expect(first.length()).toBeCloseTo(5e7, -4);
  });

  it('puts the apsides at the right distances, opposite each other', () => {
    const s = leoStartState();
    s.velocity.multiplyScalar(1.03);
    const el = orbitElements(s.position, s.velocity, EARTH.gm);
    const { periapsis, apoapsis } = apsides(el);
    expect(periapsis.length()).toBeCloseTo(el.periapsisRadius, 0);
    expect(apoapsis?.length()).toBeCloseTo(el.apoapsisRadius, 0);
    expect(
      periapsis
        .clone()
        .normalize()
        .dot(apoapsis?.clone().normalize() ?? new Vector3()),
    ).toBeCloseTo(-1, 9);
  });
});
