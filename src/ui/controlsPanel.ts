import {
  AXIS_LABELS,
  PRESS_ACTIONS,
  PRESS_ACTION_LABELS,
  type Bindings,
  type HoldAction,
} from '../input/bindings';
import { expandCalibration, type ThrottleCalibration } from '../input/gamepad/axisShaping';
import { findProfile, type AxisRole, type GamepadProfile } from '../input/gamepad/profile';
import { defaultInputSettings, saveInputSettings, type InputSettings } from '../input/storage';

const ROLE_LABELS: Record<AxisRole, string> = {
  pitch: 'Pitch',
  yaw: 'Yaw',
  roll: 'Roll',
  right: 'Translate left/right',
  up: 'Translate up/down',
  forward: 'Translate forward/back',
  throttle: 'Throttle lever',
};
const HOLD_LABELS: Record<HoldAction, string> = {
  throttleUp: 'Throttle up',
  throttleDown: 'Throttle down',
};

type Capture =
  | { kind: 'key'; assign: (code: string | null) => void }
  | { kind: 'button'; baseline: boolean[]; assign: (index: number | null) => void }
  | { kind: 'axis'; baseline: number[]; assign: (index: number) => void };

const keyName = (code: string | undefined) =>
  code
    ? code
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/(Left|Right)$/, ' $1')
    : '—';

/** Removes a key from every binding, so each key does one thing. */
function unbindKey(keyboard: Bindings, code: string): void {
  for (const a of keyboard.axes) {
    if (a.positive === code) a.positive = '';
    if (a.negative === code) a.negative = '';
  }
  for (const list of [...Object.values(keyboard.hold), ...Object.values(keyboard.press)]) {
    const i = list.indexOf(code);
    if (i >= 0) list.splice(i, 1);
  }
}

function activePad(settings: InputSettings): { pad: Gamepad; profile: GamepadProfile } | null {
  for (const pad of navigator.getGamepads()) {
    if (!pad?.connected) continue;
    const profile = findProfile(settings.profiles, pad);
    if (profile) return { pad, profile };
  }
  return null;
}

/**
 * Controls section of the pause panel: rebind keyboard keys, HOTAS axes and
 * buttons, tune dead zones and curves, and calibrate the throttle lever.
 */
export function createControlsPanel(
  settings: InputSettings,
  onChange: (settings: InputSettings) => void,
) {
  const root = document.createElement('div');
  root.className = 'controls';
  let capture: Capture | null = null;
  let calibrating: { profile: GamepadProfile; range: ThrottleCalibration | null } | null = null;
  let status = '';

  const commit = () => {
    saveInputSettings(settings);
    onChange(settings);
    render();
  };

  const startCapture = (c: Capture, prompt: string) => {
    capture = c;
    status = prompt;
    render();
  };

  // Key capture runs before the flight keyboard handler and hides the key from it.
  window.addEventListener(
    'keydown',
    (e) => {
      if (capture?.kind !== 'key') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const c = capture;
      capture = null;
      status = '';
      if (e.code === 'Escape') {
        render();
        return;
      }
      c.assign(e.code === 'Delete' || e.code === 'Backspace' ? null : e.code);
      commit();
    },
    { capture: true },
  );

  const button = (text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  };

  const row = (table: HTMLTableElement, label: string, ...cells: (HTMLElement | string)[]) => {
    const r = table.insertRow();
    r.insertCell().textContent = label;
    for (const c of cells) {
      const cell = r.insertCell();
      if (typeof c === 'string') cell.textContent = c;
      else cell.appendChild(c);
    }
  };

  const keyButton = (code: string | undefined, assign: (code: string | null) => void) =>
    button(keyName(code), () => {
      startCapture(
        {
          kind: 'key',
          assign: (newCode) => {
            if (newCode) unbindKey(settings.keyboard, newCode);
            assign(newCode);
          },
        },
        'Press a key (Esc cancels, Delete clears)',
      );
    });

  const slider = (value: number, max: number, onInput: (v: number) => void) => {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(max);
    input.step = '0.01';
    input.value = String(value);
    input.title = value.toFixed(2);
    input.addEventListener('change', () => {
      onInput(Number(input.value));
      commit();
    });
    return input;
  };

  function renderKeyboard(): HTMLElement {
    const kb = settings.keyboard;
    const table = document.createElement('table');
    for (const binding of kb.axes) {
      const [plus, minus] = AXIS_LABELS[binding.axis];
      row(
        table,
        plus,
        keyButton(binding.positive, (c) => (binding.positive = c ?? '')),
      );
      row(
        table,
        minus,
        keyButton(binding.negative, (c) => (binding.negative = c ?? '')),
      );
    }
    for (const action of ['throttleUp', 'throttleDown'] as HoldAction[]) {
      const list = kb.hold[action];
      row(
        table,
        HOLD_LABELS[action],
        keyButton(list[0], (c) => list.splice(0, list.length, ...(c ? [c] : []))),
      );
    }
    for (const action of PRESS_ACTIONS) {
      const list = kb.press[action];
      row(
        table,
        PRESS_ACTION_LABELS[action],
        keyButton(list[0], (c) => list.splice(0, list.length, ...(c ? [c] : []))),
      );
    }
    return table;
  }

  function renderGamepad(): HTMLElement {
    const wrap = document.createElement('div');
    const active = activePad(settings);
    const profile = active?.profile ?? settings.profiles[0];
    if (!profile) return wrap;
    const note = document.createElement('p');
    note.textContent = active
      ? `Connected: ${profile.name}`
      : `${profile.name}: not connected. Press a button on it to connect.`;
    wrap.appendChild(note);

    const axes = document.createElement('table');
    const header = axes.insertRow();
    for (const h of ['Axis', 'Source', 'Invert', 'Dead zone', 'Curve'])
      header.insertCell().textContent = h;
    for (const role of Object.keys(ROLE_LABELS) as AxisRole[]) {
      const mapping = profile.axes[role];
      const source = button(mapping ? `Axis ${String(mapping.index)}` : '—', () => {
        const pad = activePad(settings)?.pad;
        if (!pad) {
          status = 'Connect the controller first (press a button on it).';
          render();
          return;
        }
        startCapture(
          {
            kind: 'axis',
            baseline: [...pad.axes],
            assign: (index) => {
              const existing = profile.axes[role];
              profile.axes[role] = existing
                ? { ...existing, index }
                : { index, invert: false, deadzone: role === 'throttle' ? 0 : 0.05, curve: 0 };
            },
          },
          `Move the control for ${ROLE_LABELS[role]} all the way`,
        );
      });
      if (!mapping) {
        row(axes, ROLE_LABELS[role], source, '', '', '');
        continue;
      }
      const invert = document.createElement('input');
      invert.type = 'checkbox';
      invert.checked = mapping.invert;
      invert.addEventListener('change', () => {
        mapping.invert = invert.checked;
        commit();
      });
      const isThrottle = role === 'throttle';
      row(
        axes,
        ROLE_LABELS[role],
        source,
        invert,
        isThrottle ? '' : slider(mapping.deadzone, 0.5, (v) => (mapping.deadzone = v)),
        isThrottle ? '' : slider(mapping.curve, 1, (v) => (mapping.curve = v)),
      );
    }
    wrap.appendChild(axes);

    const buttons = document.createElement('table');
    for (const action of PRESS_ACTIONS) {
      const index = profile.buttons[action];
      row(
        buttons,
        PRESS_ACTION_LABELS[action],
        button(index === undefined ? '—' : `Button ${String(index)}`, () => {
          const pad = activePad(settings)?.pad;
          if (!pad) {
            status = 'Connect the controller first (press a button on it).';
            render();
            return;
          }
          startCapture(
            {
              kind: 'button',
              baseline: pad.buttons.map((b) => b.pressed),
              assign: (newIndex) => {
                // One action per button.
                // One action per button, and one button per action.
                const kept = Object.entries(profile.buttons).filter(
                  ([other, i]) => other !== action && i !== newIndex,
                );
                profile.buttons = Object.fromEntries(kept);
                if (newIndex !== null) profile.buttons[action] = newIndex;
              },
            },
            `Press the button for ${PRESS_ACTION_LABELS[action]} (Esc cancels)`,
          );
        }),
      );
    }
    wrap.appendChild(buttons);

    if (profile.axes.throttle) {
      const cal = settings.throttleCalibration[profile.name];
      const text = calibrating
        ? 'Move the lever fully forward and back, then click Done'
        : cal
          ? `Throttle calibrated: ${cal.min.toFixed(2)} to ${cal.max.toFixed(2)}`
          : 'Throttle: default range';
      const p = document.createElement('p');
      p.textContent = `${text} `;
      p.appendChild(
        button(calibrating ? 'Done' : 'Calibrate throttle', () => {
          if (calibrating) {
            if (calibrating.range && calibrating.range.max - calibrating.range.min > 0.5) {
              settings.throttleCalibration[profile.name] = calibrating.range;
            }
            calibrating = null;
            commit();
          } else {
            calibrating = { profile, range: null };
            render();
          }
        }),
      );
      wrap.appendChild(p);
    }
    return wrap;
  }

  function render(): void {
    root.replaceChildren();
    const status_ = document.createElement('p');
    status_.className = 'controls-status';
    status_.textContent = status;

    const kbTitle = document.createElement('h3');
    kbTitle.textContent = 'Keyboard';
    const padTitle = document.createElement('h3');
    padTitle.textContent = 'HOTAS / gamepad';
    const columns = document.createElement('div');
    columns.className = 'controls-columns';
    const left = document.createElement('div');
    left.append(kbTitle, renderKeyboard());
    const right = document.createElement('div');
    right.append(padTitle, renderGamepad());
    columns.append(left, right);

    const reset = button('Reset controls to defaults', () => {
      const defaults = defaultInputSettings();
      settings.keyboard = defaults.keyboard;
      settings.profiles = defaults.profiles;
      settings.throttleCalibration = {};
      capture = null;
      calibrating = null;
      status = '';
      commit();
    });
    root.append(status_, columns, reset);
  }

  render();

  return {
    element: root,
    /** Polls the controller while the panel is open, for capture and calibration. */
    update(): void {
      if (calibrating) {
        const active = activePad(settings);
        const mapping = calibrating.profile.axes.throttle;
        const raw = mapping ? active?.pad.axes[mapping.index] : undefined;
        if (mapping && raw !== undefined) {
          const x = mapping.invert ? -raw : raw;
          calibrating.range = calibrating.range
            ? expandCalibration(calibrating.range, raw, mapping.invert)
            : { min: x, max: x };
        }
      }
      if (!capture || capture.kind === 'key') return;
      const pad = activePad(settings)?.pad;
      if (!pad) return;
      const c = capture;
      if (c.kind === 'button') {
        const index = pad.buttons.findIndex((b, i) => b.pressed && !c.baseline[i]);
        if (index < 0) return;
        capture = null;
        status = '';
        c.assign(index);
        commit();
      } else {
        let best = -1;
        let bestDelta = 0.5;
        pad.axes.forEach((v, i) => {
          const delta = Math.abs(v - (c.baseline[i] ?? 0));
          if (delta > bestDelta) {
            best = i;
            bestDelta = delta;
          }
        });
        if (best < 0) return;
        capture = null;
        status = '';
        c.assign(best);
        commit();
      }
    },
    /** Cancels any capture or calibration in progress (when the panel closes). */
    cancel(): void {
      capture = null;
      calibrating = null;
      status = '';
      render();
    },
  };
}
