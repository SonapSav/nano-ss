import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createControlState, type AssistMode, type ControlState } from './controls';
import { computeCommands, createFlightCommands, createFlightComputer } from './flightComputer';
import { createShip, stepShip, type Ship } from './ship';
import { placeholderSpacecraft } from './ships/placeholderSpacecraft';

const DT = 1 / 120;
const DEG = Math.PI / 180;

function fly(
  seconds: number,
  setup: (ship: Ship, controls: ControlState) => void,
  mode: AssistMode,
  fa = false,
) {
  const ship = createShip(placeholderSpacecraft);
  const controls = createControlState();
  setup(ship, controls);
  const fc = createFlightComputer(mode, fa);
  const commands = createFlightCommands();
  const start = ship.body.orientation.clone();
  for (let i = 0; i < seconds * 120; i++) {
    computeCommands(fc, ship, controls, commands);
    stepShip(ship, commands.engines, commands.rcs, DT);
  }
  return { ship, start };
}

const noseOf = (ship: Ship) => new Vector3(0, 0, -1).applyQuaternion(ship.body.orientation);
const rightOf = (ship: Ship) => new Vector3(1, 0, 0).applyQuaternion(ship.body.orientation);

describe('attitude modes', () => {
  it('kill rotation stops a tumble', () => {
    const { ship } = fly(30, (s) => s.body.angularVelocity.set(0.05, -0.04, 0.1), 'kill-rotation');
    expect(ship.body.angularVelocity.length()).toBeLessThan(1e-3);
  });

  it('hold attitude returns to the orientation captured at release', () => {
    const { ship, start } = fly(
      60,
      (s) => s.body.angularVelocity.set(0.02, 0.01, 0),
      'hold-attitude',
    );
    expect(ship.body.orientation.angleTo(start)).toBeLessThan(0.5 * DEG);
    expect(ship.body.angularVelocity.length()).toBeLessThan(1e-3);
  });

  it('hold attitude stays put with no disturbance', () => {
    const { ship } = fly(10, () => undefined, 'hold-attitude');
    expect(ship.body.orientation.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });

  it('retrograde flips the nose against the motion and holds it, keeping roll', () => {
    const { ship } = fly(
      40,
      (s) => {
        s.body.velocity.set(0, 0, -100); // flying nose-first
        s.body.orientation.setFromAxisAngle(new Vector3(0, 0, 1), 30 * DEG); // rolled 30°
      },
      'retrograde',
    );
    const retro = ship.body.velocity.clone().normalize().negate();
    expect(noseOf(ship).angleTo(retro)).toBeLessThan(1 * DEG);
    expect(ship.body.angularVelocity.length()).toBeLessThan(2e-3);
    // The wings stayed level with the original roll axis (no extra roll from the flip).
    expect(Math.abs(rightOf(ship).z)).toBeLessThan(0.05);
  });

  it('prograde turns the nose onto the velocity from any starting orientation', () => {
    const { ship } = fly(
      40,
      (s) => {
        s.body.velocity.set(30, -10, 20);
        s.body.orientation.setFromAxisAngle(new Vector3(1, 1, 0).normalize(), 2.5);
      },
      'prograde',
    );
    expect(noseOf(ship).angleTo(ship.body.velocity.clone().normalize())).toBeLessThan(1 * DEG);
  });

  it('off passes pilot input straight through', () => {
    const ship = createShip(placeholderSpacecraft);
    const controls = { ...createControlState(), pitch: 1, yaw: 0.5, roll: -1, forward: 1 };
    const commands = computeCommands(
      createFlightComputer('off', false),
      ship,
      controls,
      createFlightCommands(),
    );
    expect(commands.rcs.rotation.toArray()).toEqual([1, -0.5, 1]);
    expect(commands.rcs.translation.toArray()).toEqual([0, 0, -1]);
  });
});

describe('engines and reverse', () => {
  it('routes the throttle to the main engine, or to the retro engines in reverse', () => {
    const ship = createShip(placeholderSpacecraft);
    const fc = createFlightComputer('off', false);
    const forward = computeCommands(
      fc,
      ship,
      { ...createControlState(), throttle: 0.7 },
      createFlightCommands(),
    );
    expect(forward.engines).toEqual({ main: 0.7, retro: 0 });
    const reverse = computeCommands(
      fc,
      ship,
      { ...createControlState(), throttle: 0.7, reverse: true },
      createFlightCommands(),
    );
    expect(reverse.engines).toEqual({ main: 0, retro: 0.7 });
  });
});

describe('flight assist', () => {
  it('cancels sideways and up/down drift', () => {
    const { ship } = fly(30, (s) => s.body.velocity.set(2, -1.5, 0), 'off', true);
    expect(ship.body.velocity.length()).toBeLessThan(0.01);
  });

  it('brakes to a stop from 50 m/s forward with the throttle at 0', () => {
    const { ship } = fly(90, (s) => s.body.velocity.set(0, 0, -50), 'off', true);
    expect(ship.body.velocity.length()).toBeLessThan(0.01);
  });

  it('brakes to a stop from 5 m/s backward', () => {
    const { ship } = fly(60, (s) => s.body.velocity.set(0, 0, 5), 'off', true);
    expect(ship.body.velocity.length()).toBeLessThan(0.01);
  });

  it('does not brake while the throttle is open', () => {
    const { ship } = fly(
      2,
      (s, c) => {
        s.body.velocity.set(0, 0, -50);
        c.throttle = 0.5;
      },
      'off',
      true,
    );
    expect(-ship.body.velocity.z).toBeGreaterThan(50);
  });

  it('never overrides translation input', () => {
    const { ship } = fly(5, (_s, c) => (c.right = 1), 'off', true);
    expect(ship.body.velocity.x).toBeGreaterThan(0.3);
  });

  it('changes nothing when off', () => {
    const { ship } = fly(10, (s) => s.body.velocity.set(2, 0, -50), 'off', false);
    expect(ship.body.velocity.toArray()).toEqual(
      [2, 0, -50].map((v) => expect.closeTo(v, 9) as number),
    );
  });
});
