/**
 * Pilot commands, independent of the input device. The keyboard fills this
 * now; the HOTAS fills the same structure in Stage 2.
 *
 * Rotation, in pilot terms: pitch + = nose up, yaw + = nose right,
 * roll + = right wing down. Translation: right, up, forward. All -1 to 1.
 */
export interface ControlState {
  pitch: number;
  yaw: number;
  roll: number;
  right: number;
  up: number;
  forward: number;
  /** Throttle, 0 to 1: drives the main engine, or the retro engines when `reverse` is on. */
  throttle: number;
  /** Reverse toggle (D-042): the throttle drives the nose retro engines. */
  reverse: boolean;
}

export type AssistMode = 'off' | 'kill-rotation' | 'hold-attitude' | 'prograde' | 'retrograde';

/** Modes the T key cycles through; prograde and retrograde have their own keys. */
export const ASSIST_MODES: readonly AssistMode[] = ['off', 'kill-rotation', 'hold-attitude'];

export function nextAssistMode(mode: AssistMode): AssistMode {
  const index = ASSIST_MODES.indexOf(mode);
  // From prograde or retrograde, T goes back to off.
  if (index < 0) return 'off';
  return ASSIST_MODES[(index + 1) % ASSIST_MODES.length] ?? 'off';
}

export function createControlState(): ControlState {
  return { pitch: 0, yaw: 0, roll: 0, right: 0, up: 0, forward: 0, throttle: 0, reverse: false };
}

export function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
