import type { ControlState } from '../sim/controls';
import { THROTTLE_RATE, boundCodes, type Bindings, type PressAction } from './bindings';

const anyHeld = (held: ReadonlySet<string>, codes: readonly string[]) =>
  codes.some((c) => held.has(c));

/** Writes held keys into the control state; throttle ramps by `dt` seconds. */
export function applyKeyboard(
  held: ReadonlySet<string>,
  bindings: Readonly<Bindings>,
  controls: ControlState,
  dt: number,
): void {
  for (const { axis, positive, negative } of bindings.axes) {
    controls[axis] = (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
  }
  const ramp =
    (anyHeld(held, bindings.hold.throttleUp) ? 1 : 0) -
    (anyHeld(held, bindings.hold.throttleDown) ? 1 : 0);
  controls.throttle = Math.max(0, Math.min(1, controls.throttle + ramp * THROTTLE_RATE * dt));
}

/**
 * Tracks keyboard state on `target` (normally `window`). Held keys feed the
 * axes; press actions are queued until read. Held keys are cleared when the
 * window loses focus, so nothing stays stuck on.
 */
export class KeyboardInput {
  readonly held = new Set<string>();
  private readonly pressed: PressAction[] = [];
  private codes = new Set<string>();
  private readonly pressByCode = new Map<string, PressAction>();

  constructor(
    target: EventTarget,
    public bindings: Readonly<Bindings>,
  ) {
    this.setBindings(bindings);
    target.addEventListener('keydown', (e) => {
      this.onKeyDown(e as KeyboardEvent);
    });
    target.addEventListener('keyup', (e) => {
      this.held.delete((e as KeyboardEvent).code);
    });
    target.addEventListener('blur', () => {
      this.held.clear();
    });
  }

  /** Switches to new bindings (after rebinding in the controls panel). */
  setBindings(bindings: Readonly<Bindings>): void {
    this.bindings = bindings;
    this.codes = boundCodes(bindings);
    this.pressByCode.clear();
    for (const [action, list] of Object.entries(bindings.press) as [PressAction, string[]][]) {
      for (const code of list) this.pressByCode.set(code, action);
    }
    this.held.clear();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.codes.has(e.code)) return;
    // Keep bound keys away from the browser (e.g. Ctrl+H history) where it allows it.
    e.preventDefault();
    this.held.add(e.code);
    const action = this.pressByCode.get(e.code);
    if (action && !e.repeat) this.pressed.push(action);
  }

  /** Returns and clears the press actions since the last call. */
  takeActions(): PressAction[] {
    return this.pressed.splice(0);
  }
}
