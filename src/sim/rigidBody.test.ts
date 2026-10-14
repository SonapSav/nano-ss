import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  angularMomentumWorld,
  createBodyState,
  integrateBody,
  rotationalEnergy,
  type Inertia,
} from './rigidBody';

const DT = 1 / 120;
const zero = new Vector3();

describe('integrateBody', () => {
  it('keeps constant velocity with no force', () => {
    const body = createBodyState();
    body.velocity.set(3, -2, 10);
    for (let i = 0; i < 1200; i++) integrateBody(body, zero, zero, 1000, { x: 1, y: 1, z: 1 }, DT);
    expect(body.velocity.toArray()).toEqual([3, -2, 10]);
    expect(body.position.x).toBeCloseTo(30, 9);
    expect(body.position.y).toBeCloseTo(-20, 9);
    expect(body.position.z).toBeCloseTo(100, 9);
  });

  it('accelerates by F/m', () => {
    const body = createBodyState();
    const force = new Vector3(0, 0, -2000);
    for (let i = 0; i < 120; i++) integrateBody(body, force, zero, 1000, { x: 1, y: 1, z: 1 }, DT);
    expect(body.velocity.z).toBeCloseTo(-2, 9);
  });

  it('conserves angular momentum and energy when tumbling torque-free', () => {
    // Spin mostly about X, the intermediate axis here: the classic unstable tumble.
    const inertia: Inertia = { x: 130_000, y: 150_000, z: 34_000 };
    const body = createBodyState();
    body.angularVelocity.set(0.5, 0.01, 0.01);
    const l0 = angularMomentumWorld(body, inertia, new Vector3());
    const e0 = rotationalEnergy(body, inertia);

    let minSpinX = Infinity;
    for (let i = 0; i < 120 * 60; i++) {
      integrateBody(body, zero, zero, 1000, inertia, DT);
      minSpinX = Math.min(minSpinX, Math.abs(body.angularVelocity.x));
    }

    const l1 = angularMomentumWorld(body, inertia, new Vector3());
    expect(l1.distanceTo(l0) / l0.length()).toBeLessThan(1e-3);
    expect(Math.abs(rotationalEnergy(body, inertia) - e0) / e0).toBeLessThan(1e-6);
    // The tumble really happened: the spin left the X axis at some point.
    expect(minSpinX).toBeLessThan(0.25);
    expect(body.orientation.length()).toBeCloseTo(1, 12);
  });
});
