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
  /** Main engine throttle, 0 to 1. */
  throttle: number;
}

export type AssistMode = 'off' | 'kill-rotation' | 'hold-attitude';

export const ASSIST_MODES: readonly AssistMode[] = ['off', 'kill-rotation', 'hold-attitude'];

export function nextAssistMode(mode: AssistMode): AssistMode {
  const next = ASSIST_MODES[(ASSIST_MODES.indexOf(mode) + 1) % ASSIST_MODES.length];
  return next ?? 'off';
}

export function createControlState(): ControlState {
  return { pitch: 0, yaw: 0, roll: 0, right: 0, up: 0, forward: 0, throttle: 0 };
}

export function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
