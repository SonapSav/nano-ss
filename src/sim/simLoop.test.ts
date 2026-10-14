import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createShip, stepShip, type RcsCommand } from './ship';
import { placeholderSpacecraft } from './ships/placeholderSpacecraft';
import { FixedStepLoop } from './simLoop';

function flyAt(frameHz: number, seconds: number) {
  const ship = createShip(placeholderSpacecraft);
  const rcs: RcsCommand = {
    rotation: new Vector3(0.3, -0.2, 0.1),
    translation: new Vector3(0, 1, 0),
  };
  const loop = new FixedStepLoop((dt) => {
    stepShip(ship, { main: 0.8, retro: 0 }, rcs, dt);
  });
  for (let i = 0; i < frameHz * seconds; i++) loop.advance(1 / frameHz);
  return { ship, loop, rcs };
}

describe('FixedStepLoop', () => {
  it('gives the same flight at 60 Hz and 144 Hz frame rates', () => {
    const a = flyAt(60, 2);
    const b = flyAt(144, 2);
    // Frame-time rounding can leave one step pending on either side.
    expect(Math.abs(a.loop.steps - b.loop.steps)).toBeLessThanOrEqual(1);
    while (a.loop.steps < b.loop.steps) a.loop.advance(a.loop.dt);
    while (b.loop.steps < a.loop.steps) b.loop.advance(b.loop.dt);
    expect(a.ship.body.position.toArray()).toEqual(b.ship.body.position.toArray());
    expect(a.ship.body.orientation.toArray()).toEqual(b.ship.body.orientation.toArray());
  });

  it('caps the catch-up after a long stall', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => (steps += 1));
    loop.advance(5);
    expect(steps).toBe(30); // 0.25 s at 120 Hz
  });

  it('does not step while paused', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => (steps += 1));
    loop.paused = true;
    loop.advance(1);
    expect(steps).toBe(0);
  });
});
