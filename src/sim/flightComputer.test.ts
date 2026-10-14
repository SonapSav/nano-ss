import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createControlState } from './controls';
import { computeRcs, createFlightComputer } from './flightComputer';
import { createShip, stepShip, type RcsCommand } from './ship';
import { placeholderSpaceplane } from './ships/placeholderSpaceplane';

const DT = 1 / 120;

function fly(
  seconds: number,
  setup: (ship: ReturnType<typeof createShip>) => void,
  mode: 'kill-rotation' | 'hold-attitude',
) {
  const ship = createShip(placeholderSpaceplane);
  setup(ship);
  const fc = createFlightComputer(mode);
  const controls = createControlState();
  const rcs: RcsCommand = { rotation: new Vector3(), translation: new Vector3() };
  const start = ship.body.orientation.clone();
  for (let i = 0; i < seconds * 120; i++) {
    computeRcs(fc, ship, controls, rcs);
    stepShip(ship, 0, rcs, DT);
  }
  return { ship, start };
}

describe('flight computer', () => {
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
    const errorDegrees = (ship.body.orientation.angleTo(start) * 180) / Math.PI;
    expect(errorDegrees).toBeLessThan(0.5);
    expect(ship.body.angularVelocity.length()).toBeLessThan(1e-3);
  });

  it('hold attitude stays put with no disturbance', () => {
    const { ship } = fly(10, () => undefined, 'hold-attitude');
    expect(ship.body.orientation.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });

  it('off passes pilot input straight through', () => {
    const ship = createShip(placeholderSpaceplane);
    const controls = { ...createControlState(), pitch: 1, yaw: 0.5, roll: -1, forward: 1 };
    const rcs: RcsCommand = { rotation: new Vector3(), translation: new Vector3() };
    computeRcs(createFlightComputer('off'), ship, controls, rcs);
    expect(rcs.rotation.toArray()).toEqual([1, -0.5, 1]);
    expect(rcs.translation.toArray()).toEqual([0, 0, -1]);
  });
});
