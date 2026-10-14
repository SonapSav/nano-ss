import { Vector3 } from 'three/webgpu';
import { SECONDS_PER_DAY } from './time';

/**
 * Geocentric state table from NASA JPL Horizons (written by
 * scripts/scenery/ephemeris.ts): ICRF, Earth-centred, UT, km and km/s.
 * Positions between samples use cubic Hermite interpolation with the sampled
 * velocities, accurate to well under a kilometre for the Moon.
 */
export class Ephemeris {
  readonly startJD: number;
  readonly stepDays: number;
  readonly count: number;
  private readonly data: Float64Array;

  constructor(buffer: ArrayBuffer) {
    const all = new Float64Array(buffer);
    const [version, startJD, stepDays, count] = all;
    if (version !== 1 || startJD === undefined || stepDays === undefined || count === undefined) {
      throw new Error('Unsupported ephemeris file');
    }
    this.startJD = startJD;
    this.stepDays = stepDays;
    this.count = count;
    this.data = all.subarray(4);
  }

  static async load(url: string): Promise<Ephemeris> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${String(response.status)}`);
    return new Ephemeris(await response.arrayBuffer());
  }

  get endJD(): number {
    return this.startJD + (this.count - 1) * this.stepDays;
  }

  /** Position (m) and optionally velocity (m/s) at a Julian date (UT); clamped to the table's range. */
  stateAt(jd: number, position: Vector3, velocity?: Vector3): Vector3 {
    const u = Math.min(Math.max((jd - this.startJD) / this.stepDays, 0), this.count - 1);
    const i = Math.min(Math.floor(u), this.count - 2);
    const s = u - i;
    const h = this.stepDays * SECONDS_PER_DAY; // sample spacing in seconds
    const d = this.data;
    const a = i * 6;
    const b = a + 6;

    // Cubic Hermite basis and its derivative.
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const at = (k: number) => d[k] ?? 0;
    const pos = (axis: number) =>
      (h00 * at(a + axis) +
        h10 * h * at(a + 3 + axis) +
        h01 * at(b + axis) +
        h11 * h * at(b + 3 + axis)) *
      1000;
    position.set(pos(0), pos(1), pos(2));

    if (velocity) {
      const g00 = (6 * s2 - 6 * s) / h;
      const g10 = 3 * s2 - 4 * s + 1;
      const g01 = (-6 * s2 + 6 * s) / h;
      const g11 = 3 * s2 - 2 * s;
      const vel = (axis: number) =>
        (g00 * at(a + axis) +
          g10 * at(a + 3 + axis) +
          g01 * at(b + axis) +
          g11 * at(b + 3 + axis)) *
        1000;
      velocity.set(vel(0), vel(1), vel(2));
    }
    return position;
  }
}
