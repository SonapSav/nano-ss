/** Julian date of the Unix epoch (1970-01-01 00:00 UTC). */
export const JD_UNIX_EPOCH = 2440587.5;
export const SECONDS_PER_DAY = 86_400;

export const julianDateFromUnixMs = (ms: number): number => ms / 86_400_000 + JD_UNIX_EPOCH;

/**
 * Greenwich mean sidereal time (IAU 1982), in radians: the angle Earth has
 * turned, used to orient the globe so the real day/night line shows.
 */
export function gmstRadians(jdUT: number): number {
  const d = jdUT - 2451545.0;
  const t = d / 36525;
  const degrees = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
  return ((((degrees % 360) + 360) % 360) * Math.PI) / 180;
}

/**
 * Game clock in UTC. Starts at the real current time (Stage 3 decision);
 * physics advances it in seconds of simulated time.
 */
export class SimClock {
  /** Simulated seconds since `startJD`. */
  seconds = 0;

  constructor(readonly startJD: number) {}

  static now(): SimClock {
    return new SimClock(julianDateFromUnixMs(Date.now()));
  }

  get jd(): number {
    return this.startJD + this.seconds / SECONDS_PER_DAY;
  }

  /** Julian date `offsetSeconds` from now (for substeps inside a physics step). */
  jdAt(offsetSeconds: number): number {
    return this.startJD + (this.seconds + offsetSeconds) / SECONDS_PER_DAY;
  }

  get date(): Date {
    return new Date((this.jd - JD_UNIX_EPOCH) * 86_400_000);
  }
}
