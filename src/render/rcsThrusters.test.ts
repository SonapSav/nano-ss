import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { THRUSTERS, thrusterIntensity } from './rcsThrusters';

const none = new Vector3();
const firing = (rotation: Vector3, translation: Vector3) =>
  THRUSTERS.filter((t) => thrusterIntensity(t, rotation, translation) > 0.5);

describe('thrusterIntensity', () => {
  it('fires left-side thrusters (exhaust -X) to translate right', () => {
    const on = firing(none, new Vector3(1, 0, 0));
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((t) => t.exhaust.x === -1)).toBe(true);
  });

  it('fires tail jets (exhaust +Z) to translate forward', () => {
    const on = firing(none, new Vector3(0, 0, -1));
    expect(on.every((t) => t.exhaust.z === 1)).toBe(true);
    expect(on.length).toBe(2);
  });

  it('pitches up with the nose jet pointing down and the tail jet pointing up', () => {
    const on = firing(new Vector3(1, 0, 0), none);
    expect(on).toHaveLength(2);
    expect(on.find((t) => t.position.z < 0)?.exhaust.y).toBe(-1);
    expect(on.find((t) => t.position.z > 0)?.exhaust.y).toBe(1);
  });

  it('rolls with the side pod jets', () => {
    const on = firing(new Vector3(0, 0, 1), none);
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((t) => Math.abs(t.position.x) > 1.5)).toBe(true);
  });

  it('fires nothing with no command', () => {
    expect(firing(none, none)).toHaveLength(0);
  });
});
