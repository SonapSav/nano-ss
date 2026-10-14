import type { PressAction } from '../bindings';
import {
  DEFAULT_THROTTLE_CALIBRATION,
  shapeAxis,
  throttleFromAxis,
  type ThrottleCalibration,
} from './axisShaping';
import { AXIS_ROLES, findProfile, type AxisRole, type GamepadProfile } from './profile';

/** The parts of the browser's Gamepad object this code reads (easy to fake in tests). */
export interface GamepadLike {
  id: string;
  index: number;
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

export interface GamepadFrame {
  /** Name of the active profile, or null when no supported gamepad is visible. */
  device: string | null;
  axes: Partial<Record<AxisRole, number>>;
}

/**
 * Polls the browser's gamepads, applies the matching profile, and queues
 * button presses. Chromium only lists a gamepad after its first input.
 */
export class GamepadInput {
  private readonly pressed: PressAction[] = [];
  private previousButtons: boolean[] = [];
  private activeId: string | null = null;

  constructor(
    public profiles: readonly GamepadProfile[],
    public calibrationFor: (profile: GamepadProfile) => ThrottleCalibration = () =>
      DEFAULT_THROTTLE_CALIBRATION,
    private readonly getGamepads: () => readonly (GamepadLike | null)[] = () =>
      navigator.getGamepads(),
  ) {}

  poll(): GamepadFrame {
    for (const pad of this.getGamepads()) {
      if (!pad?.connected) continue;
      const profile = findProfile(this.profiles, pad);
      if (!profile) continue;
      return this.read(pad, profile);
    }
    this.activeId = null;
    this.previousButtons = [];
    return { device: null, axes: {} };
  }

  private read(pad: GamepadLike, profile: GamepadProfile): GamepadFrame {
    const key = `${String(pad.index)}:${pad.id}`;
    if (key !== this.activeId) {
      // New or reconnected device: do not treat buttons already held as presses.
      this.activeId = key;
      this.previousButtons = pad.buttons.map((b) => b.pressed);
    }

    const axes: Partial<Record<AxisRole, number>> = {};
    for (const role of AXIS_ROLES) {
      const mapping = profile.axes[role];
      const raw = mapping ? pad.axes[mapping.index] : undefined;
      if (!mapping || raw === undefined) continue;
      axes[role] =
        role === 'throttle'
          ? throttleFromAxis(raw, mapping.invert, this.calibrationFor(profile))
          : shapeAxis(raw, mapping);
    }

    for (const [action, index] of Object.entries(profile.buttons) as [PressAction, number][]) {
      const now = pad.buttons[index]?.pressed ?? false;
      if (now && !this.previousButtons[index]) this.pressed.push(action);
    }
    this.previousButtons = pad.buttons.map((b) => b.pressed);

    return { device: profile.name, axes };
  }

  /** Returns and clears the button actions since the last call. */
  takeActions(): PressAction[] {
    return this.pressed.splice(0);
  }
}
