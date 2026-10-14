import type { FrameRateMode } from './frameLimiter';

export interface Settings {
  frameRate: FrameRateMode;
  /** Motion reference dust around the ship (not physical; an aid to see drift). */
  dust: boolean;
  /** Flight assist (FA) on at start; toggled in flight with Y (D-041). */
  fa: boolean;
}

const STORAGE_KEY = 'nano-ss.settings';
const DEFAULTS: Settings = { frameRate: 'cap-60', dust: true, fa: true };

/** Loads settings; browser storage may be blocked, so failures fall back to defaults. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      frameRate: parsed.frameRate === 'display' ? 'display' : 'cap-60',
      dust: typeof parsed.dust === 'boolean' ? parsed.dust : DEFAULTS.dust,
      fa: typeof parsed.fa === 'boolean' ? parsed.fa : DEFAULTS.fa,
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

/** Pause panel with the frame rate setting, fullscreen, and the controls section. */
export function createSettingsPanel(
  parent: HTMLElement,
  settings: Settings,
  handlers: { onChange: (s: Settings) => void; onFullscreen: () => void },
  controls: HTMLElement,
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

  const dustLabel = document.createElement('label');
  const dust = document.createElement('input');
  dust.type = 'checkbox';
  dust.checked = settings.dust;
  dust.addEventListener('change', () => {
    settings.dust = dust.checked;
    saveSettings(settings);
    handlers.onChange(settings);
  });
  dustLabel.append(dust, ' Motion reference dust (an aid to see drift; not physical)');

  const fullscreen = document.createElement('button');
  fullscreen.type = 'button';
  fullscreen.textContent = 'Fullscreen';
  fullscreen.addEventListener('click', handlers.onFullscreen);

  const mouse = document.createElement('p');
  mouse.textContent = 'Mouse drag orbits the chase camera; the wheel zooms.';

  const hint = document.createElement('p');
  hint.textContent = 'Esc to resume';

  panel.append(
    title,
    rateLabel,
    document.createElement('br'),
    dustLabel,
    document.createElement('br'),
    fullscreen,
    mouse,
    controls,
    hint,
  );
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
