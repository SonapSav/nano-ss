import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MOON } from './bodies';
import { Ephemeris } from './ephemeris';
import { MoonFrame, eastNorth, selenographic } from './moonFrame';

const b = readFileSync('public/data/moon.ephem');
const moon = new Ephemeris(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

function frameAt(jd: number) {
  const p = new Vector3();
  const v = new Vector3();
  const p2 = new Vector3();
  const v2 = new Vector3();
  moon.stateAt(jd, p, v);
  moon.stateAt(jd + 1 / 86_400, p2, v2);
  const f = new MoonFrame();
  f.set(p, v, p2, v2, 1);
  return f;
}

describe('MoonFrame', () => {
  it('turns the near side toward Earth', () => {
    const f = frameAt(2461327.5);
    const nearSide = f.toWorld(
      selenographic(0, 0, new Vector3()).multiplyScalar(MOON.radius),
      new Vector3(),
    );
    expect(nearSide.length()).toBeLessThan(f.position.length() - MOON.radius * 0.99);
  });

  it('spins once per orbit, about 2.66e-6 rad/s', () => {
    expect(frameAt(2461327.5).angularVelocity.length()).toBeGreaterThan(2.2e-6);
    expect(frameAt(2461327.5).angularVelocity.length()).toBeLessThan(3.1e-6);
  });

  it('gives ground velocity matching how a surface point really moves', () => {
    const jd = 2461327.5;
    const site = selenographic(0.674, 23.473, new Vector3()).multiplyScalar(MOON.radius);
    const a = frameAt(jd).toWorld(site, new Vector3());
    const later = frameAt(jd + 10 / 86_400).toWorld(site, new Vector3());
    const measured = later.sub(a).divideScalar(10);
    const predicted = frameAt(jd + 5 / 86_400).groundVelocity(a, new Vector3());
    expect(measured.distanceTo(predicted)).toBeLessThan(0.05);
  });

  it('round-trips points between frames', () => {
    const f = frameAt(2461330.1);
    const local = new Vector3(1.2e6, -3e5, 9e5);
    expect(
      f.toLocal(f.toWorld(local, new Vector3()), new Vector3()).distanceTo(local),
    ).toBeLessThan(1e-6);
  });

  it('builds east and north at the equator and near the pole', () => {
    const east = new Vector3();
    const north = new Vector3();
    eastNorth(selenographic(0, 90, new Vector3()), east, north);
    expect(east.toArray().map((v) => Math.round(v * 1e9) / 1e9)).toEqual([-1, 0, 0]);
    expect(north.z).toBeCloseTo(1, 9);
    eastNorth(selenographic(-89.67, 129.78, new Vector3()), east, north);
    expect(east.length()).toBeCloseTo(1, 9);
    expect(north.dot(east)).toBeCloseTo(0, 9);
  });
});
