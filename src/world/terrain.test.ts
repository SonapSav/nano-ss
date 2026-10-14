import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MOON } from './bodies';
import { PAD_RADIUS, Site, detail, groundRadius, type SiteData } from './terrain';

/** A tilted plane plus a bump, so the tests can check slopes and blends. */
function testSite(): Site {
  const size = 101;
  const heights = new Float32Array(size * size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) heights[j * size + i] = 300 + i * 2 - j; // rises east, falls south
  const ringSize = 50;
  const ringHeights = new Float32Array(ringSize * ringSize).fill(250); // a broad plateau at 250 m
  const data: SiteData = {
    name: 'Test',
    centerLat: 10,
    centerLon: 20,
    size,
    halfExtent: 20_000,
    heights,
    ringSize,
    ringHalfExtent: 200_000,
    ringHeights,
    padX: 1_000,
    padY: -2_000,
  };
  return new Site(data);
}

describe('Site terrain', () => {
  it('maps tangent-plane points to the surface and back (gnomonic)', () => {
    const site = testSite();
    for (const [x, y] of [
      [0, 0],
      [15_000, -7_000],
      [-19_000, 18_000],
    ] as const) {
      const p = site.surfacePoint(x, y, new Vector3());
      const back = site.project(p);
      expect(back?.x).toBeCloseTo(x, 3);
      expect(back?.y).toBeCloseTo(y, 3);
    }
  });

  it('flattens the pad', () => {
    const site = testSite();
    const { padX, padY } = site.data;
    for (const [dx, dy] of [
      [0, 0],
      [40, 0],
      [0, -55],
      [-30, 30],
    ] as const) {
      expect(site.height(padX + dx, padY + dy)).toBeCloseTo(site.padHeight, 6);
    }
    expect(Math.abs(site.height(padX + PAD_RADIUS + 200, padY) - site.padHeight)).toBeGreaterThan(
      1,
    );
  });

  it('is continuous: no steps across the pad blend', () => {
    const site = testSite();
    let previous = site.height(site.data.padX - 300, site.data.padY);
    for (let x = -299; x <= 300; x++) {
      const h = site.height(site.data.padX + x, site.data.padY);
      expect(Math.abs(h - previous)).toBeLessThan(1);
      previous = h;
    }
  });

  it('blends the window into the ring, and the ring back to the sphere', () => {
    const site = testSite();
    expect(site.height(19_999, 0)).toBeCloseTo(250, 0); // window edge: ring height
    expect(site.height(100_000, 50_000)).toBeCloseTo(250, 6); // inside the ring
    expect(site.height(199_999, 0)).toBeCloseTo(0, 0); // ring edge: sphere
    let previous = site.height(17_000, 0);
    for (let x = 17_001; x <= 23_000; x += 1) {
      const h = site.height(x, 0);
      expect(Math.abs(h - previous)).toBeLessThan(1);
      previous = h;
    }
  });

  it('adds metre-scale detail, bounded', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const d = detail(i * 3.7, i * 1.3);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    expect(max - min).toBeGreaterThan(1);
    expect(Math.max(-min, max)).toBeLessThan(3.5);
  });

  it('uses the site terrain inside the window and the sphere elsewhere', () => {
    const site = testSite();
    const onPad = site.padPoint(new Vector3());
    expect(groundRadius([site], onPad)).toBeCloseTo(MOON.radius + site.padHeight, 3);
    const inRing = site.surfacePoint(150_000, 0, new Vector3());
    expect(groundRadius([site], inRing)).toBeCloseTo(MOON.radius + 250, 3);
    const elsewhere = new Vector3(-1, 0, 0).multiplyScalar(MOON.radius + 1000);
    expect(groundRadius([site], elsewhere)).toBe(MOON.radius);
  });
});
