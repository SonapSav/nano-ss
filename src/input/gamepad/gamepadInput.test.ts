import { describe, expect, it } from 'vitest';
import { GamepadInput, type GamepadLike } from './gamepadInput';
import { BUILT_IN_PROFILES, GENERIC_STANDARD, HOTAS_X_LINUX, findProfile } from './profile';

const HOTAS_ID = 'Thrustmaster T.Flight Hotas X (Vendor: 044f Product: b108)';

function hotas(axes: number[], pressed: number[] = []): GamepadLike {
  return {
    id: HOTAS_ID,
    index: 0,
    mapping: '',
    connected: true,
    axes,
    buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: pressed.includes(i) })),
  };
}

//          roll  pitch throttle twist rocker hatX hatY
const CENTRED = [0, 0, 1, 0, 0, 0, 0];

describe('profiles', () => {
  it('matches the HOTAS X by vendor and product, case-insensitively', () => {
    expect(findProfile(BUILT_IN_PROFILES, { id: HOTAS_ID, mapping: '' })).toBe(HOTAS_X_LINUX);
    expect(findProfile(BUILT_IN_PROFILES, { id: HOTAS_ID.toLowerCase(), mapping: '' })).toBe(
      HOTAS_X_LINUX,
    );
  });

  it('falls back to the standard layout, and ignores unknown non-standard devices', () => {
    expect(findProfile(BUILT_IN_PROFILES, { id: 'Some pad', mapping: 'standard' })).toBe(
      GENERIC_STANDARD,
    );
    expect(findProfile(BUILT_IN_PROFILES, { id: 'Some wheel', mapping: '' })).toBeUndefined();
  });
});

describe('GamepadInput with the HOTAS X', () => {
  it('maps stick, twist, rocker, hat, and lever to flight roles', () => {
    const input = new GamepadInput(BUILT_IN_PROFILES, undefined, () => [
      hotas([1, 1, -1, 1, 1, 1, -1]),
    ]);
    const frame = input.poll();
    expect(frame.device).toBe(HOTAS_X_LINUX.name);
    expect(frame.axes).toEqual({
      roll: 1, // stick right
      pitch: 1, // pulled back = nose up
      throttle: 1, // lever forward
      yaw: 1, // twist right
      forward: 1, // rocker right
      right: 1, // hat right
      up: 1, // hat forward
    });
  });

  it('gives exactly zero for a centred stick within the dead zone', () => {
    const input = new GamepadInput(BUILT_IN_PROFILES, undefined, () => [
      hotas([0.03, -0.04, 1, 0.08, -0.09, 0, 0]),
    ]);
    const { axes } = input.poll();
    expect([axes.roll, axes.pitch, axes.yaw, axes.forward]).toEqual([0, 0, 0, 0]);
  });

  it('reports each button press once, mapped to its action', () => {
    let pressed: number[] = [];
    const input = new GamepadInput(BUILT_IN_PROFILES, undefined, () => [hotas(CENTRED, pressed)]);
    input.poll();
    pressed = [0, 11];
    input.poll();
    input.poll(); // still held: no repeat
    expect(input.takeActions()).toEqual(['assistKill', 'pause']);
    pressed = [];
    input.poll();
    pressed = [4];
    input.poll();
    expect(input.takeActions()).toEqual(['switchCamera']);
  });

  it('does not fire for buttons already held when the device appears', () => {
    const input = new GamepadInput(BUILT_IN_PROFILES, undefined, () => [hotas(CENTRED, [0])]);
    input.poll();
    expect(input.takeActions()).toEqual([]);
  });

  it('reports no device when nothing supported is connected', () => {
    const input = new GamepadInput(BUILT_IN_PROFILES, undefined, () => [null]);
    expect(input.poll()).toEqual({ device: null, axes: {} });
  });
});
