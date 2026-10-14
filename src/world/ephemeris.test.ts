import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Ephemeris } from './ephemeris';
import fixture from './horizons.fixture.json';

const load = (name: string) => {
  const bytes = readFileSync(`public/data/${name}.ephem`);
  return new Ephemeris(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

describe('Ephemeris against independent JPL Horizons points (between samples)', () => {
  for (const [name, maxErrorKm] of [
    ['moon', 1],
    ['sun', 5],
  ] as const) {
    it(`${name}: position within ${String(maxErrorKm)} km, velocity within 1 m/s`, () => {
      const table = load(name);
      for (const [jd, x, y, z, vx, vy, vz] of fixture.bodies[name]) {
        const position = new Vector3();
        const velocity = new Vector3();
        table.stateAt(jd ?? 0, position, velocity);
        const expected = new Vector3(x, y, z).multiplyScalar(1000);
        expect(position.distanceTo(expected) / 1000).toBeLessThan(maxErrorKm);
        expect(velocity.distanceTo(new Vector3(vx, vy, vz).multiplyScalar(1000))).toBeLessThan(1);
      }
    });
  }

  it('covers 2020 to 2040', () => {
    const moon = load('moon');
    expect(moon.startJD).toBeCloseTo(2458849.5, 6);
    expect(moon.endJD).toBeGreaterThan(2466154);
  });
});
