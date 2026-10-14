import { describe, expect, it } from 'vitest';
import { defaultInputSettings, loadInputSettings, saveInputSettings } from './storage';

function memoryStorage(initial?: string) {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      value = v;
    },
  };
}

describe('input settings storage', () => {
  it('round-trips rebinds, axis tuning, and calibration', () => {
    const storage = memoryStorage();
    const settings = defaultInputSettings();
    settings.keyboard.press.switchCamera = ['KeyV'];
    const hotas = settings.profiles[0];
    if (!hotas?.axes.yaw) throw new Error('fixture');
    hotas.axes.yaw.deadzone = 0.2;
    settings.throttleCalibration[hotas.name] = { min: -0.9, max: 0.95 };

    saveInputSettings(settings, storage);
    expect(loadInputSettings(storage)).toEqual(settings);
  });

  it('falls back to defaults for missing, corrupt, or old data', () => {
    const defaults = defaultInputSettings();
    expect(loadInputSettings(memoryStorage())).toEqual(defaults);
    expect(loadInputSettings(memoryStorage('{not json'))).toEqual(defaults);
    expect(loadInputSettings(memoryStorage('{"version":0,"keyboard":{}}'))).toEqual(defaults);
  });

  it('keeps valid parts and replaces invalid ones', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        keyboard: { axes: 'broken' },
        profiles: [
          {
            name: 'Thrustmaster T.Flight HOTAS X',
            axes: { yaw: { index: 3, invert: false, deadzone: 2, curve: 0 } },
            buttons: {},
          },
        ],
        throttleCalibration: {
          'Thrustmaster T.Flight HOTAS X': { min: -0.9, max: 0.9 },
          bad: { min: 1, max: 0 },
        },
      }),
    );
    const loaded = loadInputSettings(storage);
    const defaults = defaultInputSettings();
    expect(loaded.keyboard).toEqual(defaults.keyboard);
    expect(loaded.profiles).toEqual(defaults.profiles); // dead zone 2 is invalid
    expect(loaded.throttleCalibration).toEqual({
      'Thrustmaster T.Flight HOTAS X': { min: -0.9, max: 0.9 },
    });
  });

  it('upgrades saves from before new actions existed, keeping their rebinds', () => {
    const old = defaultInputSettings();
    old.keyboard.press.switchCamera = ['KeyV']; // V is now retrograde's default
    delete (old.keyboard.press as Partial<typeof old.keyboard.press>).assistRetrograde;
    delete (old.keyboard.press as Partial<typeof old.keyboard.press>).toggleReverse;
    const hotas = old.profiles[0];
    if (!hotas) throw new Error('fixture');
    hotas.buttons = { assistKill: 0, switchCamera: 5 }; // 5 is now reverse's default
    const storage = memoryStorage(JSON.stringify({ version: 1, ...old }));

    const loaded = loadInputSettings(storage);
    expect(loaded.keyboard.press.switchCamera).toEqual(['KeyV']); // rebind kept
    expect(loaded.keyboard.press.assistRetrograde).toEqual([]); // V taken, left unbound
    expect(loaded.keyboard.press.toggleReverse).toEqual(['KeyB']); // new default added
    const buttons = loaded.profiles[0]?.buttons;
    expect(buttons?.switchCamera).toBe(5);
    expect(buttons?.toggleReverse).toBeUndefined(); // button 5 taken
    expect(buttons?.assistRetrograde).toBe(2);
  });

  it('works when storage is unavailable', () => {
    expect(loadInputSettings(null)).toEqual(defaultInputSettings());
    expect(() => {
      saveInputSettings(defaultInputSettings(), null);
    }).not.toThrow();
  });
});
