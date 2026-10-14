/**
 * Two-level time warp (D-016): 1×, 2×, 4× with full control; 10×, 100×,
 * 1000× only while coasting (engines and RCS are ignored).
 */
export const WARP_LEVELS = [1, 2, 4, 10, 100, 1000] as const;
/** Highest warp at which the ship can still be flown. */
export const MAX_CONTROLLED_WARP = 4;
/** Entering this distance from the target drops warp to 1× (m). */
export const TARGET_WARP_ZONE = 10_000;

export type WarpDropReason = 'target' | 'low-orbit' | 'sphere-of-influence' | 'control-input';

export const WARP_DROP_MESSAGES: Record<WarpDropReason, string> = {
  target: 'Time warp stopped: approaching the target',
  'low-orbit': 'Time warp stopped: low pass ahead',
  'sphere-of-influence': 'Time warp stopped: changing sphere of influence',
  'control-input': 'Time warp reduced to 4×: controls in use',
};

export class TimeWarp {
  private index = 0;

  get factor(): number {
    return WARP_LEVELS[this.index] ?? 1;
  }

  /** True above the controlled levels: thrust and RCS are ignored. */
  get coasting(): boolean {
    return this.factor > MAX_CONTROLLED_WARP;
  }

  up(): void {
    this.index = Math.min(this.index + 1, WARP_LEVELS.length - 1);
  }

  down(): void {
    this.index = Math.max(this.index - 1, 0);
  }

  /** Sets the highest level not above `factor`. */
  limit(factor: number): void {
    while (this.index > 0 && this.factor > factor) this.index -= 1;
  }
}

export interface WarpConditions {
  factor: number;
  /** Altitude above the reference body and its warp safety limit (m). */
  altitude: number;
  safeAltitude: number;
  /** Periapsis altitude and time to it (s); NaN when not defined. */
  periapsisAltitude: number;
  timeToPeriapsis: number;
  /** Ship crossed into the target zone during this step. */
  enteredTargetZone: boolean;
  /** Reference body changed during this step. */
  referenceChanged: boolean;
  /** Any rotation, translation, or throttle input this step. */
  controlInput: boolean;
}

/** How far ahead (in sim seconds per warp factor) a low pass counts as imminent. */
const LOW_PASS_LOOKAHEAD = 3;

/**
 * Whether time warp must drop, and to which factor. Returns null when it can
 * stay as it is.
 */
export function warpDrop(c: WarpConditions): { reason: WarpDropReason; factor: number } | null {
  if (c.factor <= 1) return null;
  if (c.enteredTargetZone) return { reason: 'target', factor: 1 };
  if (c.referenceChanged) return { reason: 'sphere-of-influence', factor: 1 };
  const lowNow = c.altitude < c.safeAltitude;
  const lowSoon =
    c.periapsisAltitude < c.safeAltitude && c.timeToPeriapsis < c.factor * LOW_PASS_LOOKAHEAD;
  if (lowNow || lowSoon) return { reason: 'low-orbit', factor: 1 };
  if (c.controlInput && c.factor > MAX_CONTROLLED_WARP) {
    return { reason: 'control-input', factor: MAX_CONTROLLED_WARP };
  }
  return null;
}

/**
 * Longest physics substep that keeps orbits accurate (s): a fraction of the
 * free-fall time scale √(d³/GM) for each body.
 */
export function maxSubstep(bodies: readonly { distance: number; gm: number }[]): number {
  let dt = Infinity;
  for (const b of bodies)
    dt = Math.min(dt, Math.sqrt((b.distance * b.distance * b.distance) / b.gm) / 80);
  return dt;
}
