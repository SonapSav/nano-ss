/** Per-axis response settings. */
export interface AxisShape {
  invert: boolean;
  /** Fraction of travel around centre treated as zero (0 to <1). */
  deadzone: number;
  /** 0 = linear, 1 = fully cubic: finer control near centre, same full deflection. */
  curve: number;
}

/**
 * Shapes a centred axis (-1..1): invert, dead zone with rescaling so the output
 * still starts at 0 and reaches ±1, then the response curve.
 */
export function shapeAxis(raw: number, shape: AxisShape): number {
  const x = shape.invert ? -raw : raw;
  const magnitude = Math.abs(x);
  if (magnitude <= shape.deadzone) return 0;
  const t = Math.min(1, (magnitude - shape.deadzone) / (1 - shape.deadzone));
  const curved = (1 - shape.curve) * t + shape.curve * t * t * t;
  return Math.sign(x) * curved;
}

/** Throttle lever range as seen in raw axis units, after inversion. */
export interface ThrottleCalibration {
  min: number;
  max: number;
}

export const DEFAULT_THROTTLE_CALIBRATION: ThrottleCalibration = { min: -1, max: 1 };

/** Lever travel at each end that snaps to exactly 0 % or 100 %. */
const THROTTLE_END_ZONE = 0.02;

/** Maps an absolute throttle lever to 0..1 using its calibrated range. */
export function throttleFromAxis(
  raw: number,
  invert: boolean,
  calibration: ThrottleCalibration,
): number {
  const x = invert ? -raw : raw;
  const span = calibration.max - calibration.min;
  if (span <= 0) return 0;
  const t = (x - calibration.min) / span;
  if (t <= THROTTLE_END_ZONE) return 0;
  if (t >= 1 - THROTTLE_END_ZONE) return 1;
  return (t - THROTTLE_END_ZONE) / (1 - 2 * THROTTLE_END_ZONE);
}

/** Widens a calibration to include a newly seen lever position. */
export function expandCalibration(
  calibration: ThrottleCalibration,
  raw: number,
  invert: boolean,
): ThrottleCalibration {
  const x = invert ? -raw : raw;
  return { min: Math.min(calibration.min, x), max: Math.max(calibration.max, x) };
}
