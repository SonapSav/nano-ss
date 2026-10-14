import { PRESS_ACTIONS, defaultBindings, type Bindings } from './bindings';
import { DEFAULT_THROTTLE_CALIBRATION, type ThrottleCalibration } from './gamepad/axisShaping';
import {
  AXIS_ROLES,
  BUILT_IN_PROFILES,
  type AxisMapping,
  type GamepadProfile,
} from './gamepad/profile';

/** Everything the controls panel can change, saved in the browser. */
export interface InputSettings {
  keyboard: Bindings;
  /** Profiles by name; built-in profiles are edited copies. */
  profiles: GamepadProfile[];
  throttleCalibration: Record<string, ThrottleCalibration>;
}

const STORAGE_KEY = 'nano-ss.input';
const VERSION = 1;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or null where it is missing or blocked. */
function browserStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function defaultInputSettings(): InputSettings {
  return {
    keyboard: defaultBindings(),
    profiles: structuredClone(BUILT_IN_PROFILES) as GamepadProfile[],
    throttleCalibration: {},
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isCodeList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((c) => typeof c === 'string');

function validKeyboard(v: unknown): v is Bindings {
  if (!isRecord(v) || !Array.isArray(v.axes) || !isRecord(v.hold) || !isRecord(v.press))
    return false;
  const axesOk = v.axes.every(
    (a) =>
      isRecord(a) &&
      typeof a.axis === 'string' &&
      typeof a.positive === 'string' &&
      typeof a.negative === 'string',
  );
  // Actions added in later versions may be missing; `withNewActions` fills them in.
  return (
    axesOk &&
    isCodeList(v.hold.throttleUp) &&
    isCodeList(v.hold.throttleDown) &&
    Object.values(v.press).every(isCodeList)
  );
}

/** Adds default keys for actions a save does not know yet, unless the key is already taken. */
function withNewActions(saved: Bindings, defaults: Bindings): Bindings {
  const used = new Set([
    ...saved.axes.flatMap((a) => [a.positive, a.negative]),
    ...Object.values(saved.hold).flat(),
    ...Object.values(saved.press).flat(),
  ]);
  for (const action of PRESS_ACTIONS) {
    if (Array.isArray(saved.press[action])) continue;
    saved.press[action] = defaults.press[action].filter((code) => !used.has(code));
  }
  return saved;
}

/** Same for gamepad buttons: new actions get their default button if it is still free. */
function withNewButtons(saved: GamepadProfile, defaults: GamepadProfile): GamepadProfile {
  const used = new Set(Object.values(saved.buttons));
  for (const action of PRESS_ACTIONS) {
    const index = defaults.buttons[action];
    if (action in saved.buttons || index === undefined || used.has(index)) continue;
    saved.buttons[action] = index;
  }
  return saved;
}

function validMapping(v: unknown): v is AxisMapping {
  return (
    isRecord(v) &&
    Number.isInteger(v.index) &&
    typeof v.invert === 'boolean' &&
    typeof v.deadzone === 'number' &&
    v.deadzone >= 0 &&
    v.deadzone < 1 &&
    typeof v.curve === 'number' &&
    v.curve >= 0 &&
    v.curve <= 1
  );
}

function validProfile(v: unknown): v is GamepadProfile {
  if (!isRecord(v) || typeof v.name !== 'string' || !isRecord(v.axes) || !isRecord(v.buttons))
    return false;
  const axes = v.axes;
  const buttons = v.buttons;
  return (
    AXIS_ROLES.every((role) => axes[role] === undefined || validMapping(axes[role])) &&
    Object.values(buttons).every((b) => Number.isInteger(b))
  );
}

function validCalibration(v: unknown): v is ThrottleCalibration {
  return isRecord(v) && typeof v.min === 'number' && typeof v.max === 'number' && v.max > v.min;
}

/**
 * Loads saved input settings. Anything missing, corrupt, or from another
 * version falls back to the defaults, part by part.
 */
export function loadInputSettings(storage: StorageLike | null = browserStorage()): InputSettings {
  const defaults = defaultInputSettings();
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return defaults;
  }
  if (!isRecord(parsed) || parsed.version !== VERSION) return defaults;

  const keyboard = validKeyboard(parsed.keyboard)
    ? withNewActions(parsed.keyboard, defaults.keyboard)
    : defaults.keyboard;
  // Saved edits replace built-ins of the same name; new built-ins still appear.
  const saved = Array.isArray(parsed.profiles) ? parsed.profiles.filter(validProfile) : [];
  const profiles = defaults.profiles.map((p) => {
    const match = saved.find((s) => s.name === p.name);
    return match ? withNewButtons(match, p) : p;
  });
  const calibration: Record<string, ThrottleCalibration> = {};
  if (isRecord(parsed.throttleCalibration)) {
    for (const [name, cal] of Object.entries(parsed.throttleCalibration)) {
      if (validCalibration(cal)) calibration[name] = cal;
    }
  }
  return { keyboard, profiles, throttleCalibration: calibration };
}

export function saveInputSettings(
  settings: InputSettings,
  storage: StorageLike | null = browserStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...settings }));
  } catch {
    // Storage blocked or full: changes still apply for this session.
  }
}

export function calibrationFor(
  settings: InputSettings,
  profile: GamepadProfile,
): ThrottleCalibration {
  return settings.throttleCalibration[profile.name] ?? DEFAULT_THROTTLE_CALIBRATION;
}
