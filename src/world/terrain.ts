import { Vector3 } from 'three/webgpu';
import { MOON } from './bodies';
import { eastNorth, selenographic } from './moonFrame';

/** Height data for one spaceport, built by scripts/scenery/sites.ts. */
export interface SiteData {
  name: string;
  /** Projection centre (selenographic degrees) of the gnomonic window. */
  centerLat: number;
  centerLon: number;
  /** Window: `size` × `size` samples spanning ±halfExtent metres; row 0 is the north edge. */
  size: number;
  halfExtent: number;
  /** Heights above the 1737.4 km reference sphere (m), row-major. */
  heights: Float32Array;
  /** Wide, coarse ring around the window (same layout), so real terrain reaches past the horizon. */
  ringSize: number;
  ringHalfExtent: number;
  ringHeights: Float32Array;
  /** Pad centre on the tangent plane (m). */
  padX: number;
  padY: number;
}

/** Flat apron radius around the pad centre (covers the pad and the spaceport buildings), and its blend ring (m). */
export const PAD_RADIUS = 100;
const PAD_BLEND = 60;
/** Bands where the detailed window blends into the ring, and the ring into the reference sphere (m). */
const WINDOW_BLEND = 2_000;
const RING_BLEND = 20_000;

/** Bilinear sample of a size × size grid spanning ±half metres, row 0 = north edge. */
function bilinear(grid: Float32Array, size: number, half: number, x: number, y: number): number {
  const step = (2 * half) / (size - 1);
  const u = Math.min(Math.max((x + half) / step, 0), size - 1.0001);
  const v = Math.min(Math.max((half - y) / step, 0), size - 1.0001);
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const at = (a: number, b: number) => grid[b * size + a] ?? 0;
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu;
  return top + (bottom - top) * fv;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic value noise in [-1, 1] on a unit grid. */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * u;
  const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * u;
  return a + (b - a) * v;
}

/** Metre-scale roughness below the 40 m data resolution: 4 octaves, about ±2.5 m. */
export function detail(x: number, y: number): number {
  let sum = 0;
  let amplitude = 1.6;
  let wavelength = 64;
  for (let i = 0; i < 4; i++) {
    sum += amplitude * valueNoise(x / wavelength, y / wavelength);
    amplitude *= 0.45;
    wavelength /= 2.3;
  }
  return sum;
}

/**
 * A spaceport's terrain on its gnomonic tangent plane: a point (x, y) maps to
 * the Moon-fixed direction normalize(R·up + x·east + y·north).
 */
export class Site {
  readonly up = new Vector3();
  readonly east = new Vector3();
  readonly north = new Vector3();
  readonly padHeight: number;
  private readonly _d = new Vector3();

  constructor(readonly data: SiteData) {
    selenographic(data.centerLat, data.centerLon, this.up);
    eastNorth(this.up, this.east, this.north);
    this.padHeight = this.dataHeight(data.padX, data.padY);
  }

  /** Bilinear height from the detailed window (m above the reference sphere). */
  dataHeight(x: number, y: number): number {
    const { size, halfExtent, heights } = this.data;
    return bilinear(heights, size, halfExtent, x, y);
  }

  /** Bilinear height from the wide coarse ring. */
  ringHeight(x: number, y: number): number {
    const { ringSize, ringHalfExtent, ringHeights } = this.data;
    return bilinear(ringHeights, ringSize, ringHalfExtent, x, y);
  }

  /**
   * Ground height at (x, y): the detailed window (data + detail, pad flattened)
   * blended into the coarse ring at its edge, and the ring blended back to the
   * reference sphere at its own edge.
   */
  height(x: number, y: number): number {
    const reach = Math.max(Math.abs(x), Math.abs(y));
    const ringEdge = this.data.ringHalfExtent - reach;
    const ring = this.ringHeight(x, y) * smoothstep(0, RING_BLEND, ringEdge);
    const windowEdge = this.data.halfExtent - reach;
    if (windowEdge <= 0) return ring;
    const pad = Math.hypot(x - this.data.padX, y - this.data.padY);
    const padWeight = 1 - smoothstep(PAD_RADIUS, PAD_RADIUS + PAD_BLEND, pad);
    const natural = this.dataHeight(x, y) + detail(x, y);
    const local = natural + (this.padHeight - natural) * padWeight;
    return ring + (local - ring) * smoothstep(0, WINDOW_BLEND, windowEdge);
  }

  /** True if (x, y) lies inside the terrain (the ring's extent). */
  contains(x: number, y: number): boolean {
    return Math.abs(x) < this.data.ringHalfExtent && Math.abs(y) < this.data.ringHalfExtent;
  }

  /** Tangent-plane coordinates of a Moon-fixed position; null on the far hemisphere. */
  project(local: Vector3): { x: number; y: number } | null {
    const d = local.dot(this.up);
    if (d <= 0) return null;
    const k = MOON.radius / d;
    return { x: local.dot(this.east) * k, y: local.dot(this.north) * k };
  }

  /** Moon-fixed position of the ground surface at (x, y). */
  surfacePoint(x: number, y: number, out: Vector3): Vector3 {
    this._d
      .copy(this.up)
      .multiplyScalar(MOON.radius)
      .addScaledVector(this.east, x)
      .addScaledVector(this.north, y);
    return out
      .copy(this._d)
      .normalize()
      .multiplyScalar(MOON.radius + this.height(x, y));
  }

  /** Moon-fixed position of the pad centre. */
  padPoint(out: Vector3): Vector3 {
    return this.surfacePoint(this.data.padX, this.data.padY, out);
  }
}

/** Ground radius (from the Moon's centre) under a Moon-fixed position: site terrain or the sphere. */
export function groundRadius(sites: readonly Site[], local: Vector3): number {
  for (const site of sites) {
    const p = site.project(local);
    if (p && site.contains(p.x, p.y)) return MOON.radius + site.height(p.x, p.y);
  }
  return MOON.radius;
}
