import type { FrameRateMode } from './frameLimiter';

export interface Settings {
  frameRate: FrameRateMode;
}

const STORAGE_KEY = 'nano-ss.settings';
const DEFAULTS: Settings = { frameRate: 'cap-60' };

/** Loads settings; browser storage may be blocked, so failures fall back to defaults. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      frameRate: parsed.frameRate === 'display' ? 'display' : 'cap-60',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the setting still applies for this session.
  }
}

const CONTROLS_HELP: [string, string][] = [
  ['W / S', 'Pitch down / up'],
  ['A / D', 'Yaw left / right'],
  ['Q / E', 'Roll left / right'],
  ['I / K', 'Translate up / down'],
  ['J / L', 'Translate left / right'],
  ['H / N', 'Translate forward / back'],
  ['Shift / Ctrl', 'Throttle up / down'],
  ['Z / X', 'Full throttle / cut'],
  ['T', 'Assist: off, kill rotation, hold attitude'],
  ['C', 'Chase / nose camera'],
  ['Mouse drag, wheel', 'Orbit and zoom the chase camera'],
  ['F', 'Fullscreen (also captures Ctrl key combos)'],
  ['F3', 'Performance overlay'],
  ['Esc', 'Pause and settings'],
];

/** Pause panel with the frame rate setting, fullscreen, and the controls list. */
export function createSettingsPanel(
  parent: HTMLElement,
  settings: Settings,
  handlers: { onChange: (s: Settings) => void; onFullscreen: () => void },
) {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;

  const title = document.createElement('h2');
  title.textContent = 'Paused';

  const rateLabel = document.createElement('label');
  rateLabel.textContent = 'Frame rate ';
  const rate = document.createElement('select');
  for (const [value, text] of [
    ['cap-60', '60 fps (default)'],
    ['display', 'Display refresh rate'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    rate.appendChild(option);
  }
  rate.value = settings.frameRate;
  rate.addEventListener('change', () => {
    settings.frameRate = rate.value === 'display' ? 'display' : 'cap-60';
    saveSettings(settings);
    handlers.onChange(settings);
  });
  rateLabel.appendChild(rate);

  const fullscreen = document.createElement('button');
  fullscreen.type = 'button';
  fullscreen.textContent = 'Fullscreen';
  fullscreen.addEventListener('click', handlers.onFullscreen);

  const help = document.createElement('table');
  for (const [keys, action] of CONTROLS_HELP) {
    const row = help.insertRow();
    row.insertCell().textContent = keys;
    row.insertCell().textContent = action;
  }

  const hint = document.createElement('p');
  hint.textContent = 'Esc to resume';

  panel.append(title, rateLabel, fullscreen, help, hint);
  parent.appendChild(panel);

  return {
    get visible() {
      return !panel.hidden;
    },
    show(visible: boolean) {
      panel.hidden = !visible;
    },
  };
}
