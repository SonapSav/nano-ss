import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';

/** One RCS thruster: position on the hull and exhaust direction, body frame. */
export interface Thruster {
  position: Vector3;
  exhaust: Vector3;
}

/**
 * Thruster layout for the greybox spacecraft (nose at -Z): quads at the front
 * and rear of the hull for pitch, yaw, and translation, a nose jet for moving
 * back, tail jets for moving forward, and side pods for roll.
 */
export const THRUSTERS: readonly Thruster[] = (() => {
  const list: Thruster[] = [];
  const add = (p: [number, number, number], d: [number, number, number]) => {
    list.push({ position: new Vector3(...p), exhaust: new Vector3(...d) });
  };
  for (const [z, r] of [
    [-2.6, 1.3],
    [3.4, 1.4],
  ] as const) {
    add([0, r, z], [0, 1, 0]);
    add([0, -r, z], [0, -1, 0]);
    add([r, 0, z], [1, 0, 0]);
    add([-r, 0, z], [-1, 0, 0]);
  }
  add([0, 0.3, -4.4], [0, 0, -1]); // nose, fires to move back
  add([0.9, 0.6, 3.6], [0, 0, 1]); // tail, fires to move forward (beside the main engine)
  add([-0.9, 0.6, 3.6], [0, 0, 1]);
  for (const x of [-1.6, 1.6]) {
    add([x, 0.2, 0.4], [0, 1, 0]);
    add([x, -0.2, 0.4], [0, -1, 0]);
  }
  return list;
})();

const _force = new Vector3();
const _torque = new Vector3();

/** Typical lever arm of the front and rear quads (m): torque that counts as full turning effort. */
const LEVER_REF = 3;
/** Thrusters adding less than this share of turning effort stay off, as real RCS logic would keep them. */
const MIN_TURN = 0.3;

/**
 * How hard a thruster fires (0..1) for an RCS command: its push (opposite its
 * exhaust) along the translation command, plus its torque about the centre of
 * mass along the rotation command, relative to the main quads' lever arm.
 */
export function thrusterIntensity(t: Thruster, rotation: Vector3, translation: Vector3): number {
  _force.copy(t.exhaust).negate();
  const push = _force.dot(translation);
  _torque.crossVectors(t.position, _force);
  const turn = _torque.dot(rotation) / LEVER_REF;
  return Math.min(1, Math.max(0, push) + (turn >= MIN_TURN ? turn : 0));
}

/** Small exhaust plumes on the ship model, scaled by how hard each thruster fires. */
export function createRcsPlumes() {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: 0xcfe4ff,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  // Cone along +Y with its tip at the thruster, flaring outward.
  const geometry = new ConeGeometry(0.22, 1.2, 10, 1, true).translate(0, -0.6, 0).rotateX(Math.PI);
  const up = new Vector3(0, 1, 0);
  const plumes = THRUSTERS.map((t) => {
    const plume = new Mesh(geometry, material);
    plume.position.copy(t.position);
    plume.quaternion.copy(new Quaternion().setFromUnitVectors(up, t.exhaust));
    plume.visible = false;
    group.add(plume);
    return plume;
  });

  return {
    group,
    update(rotation: Vector3, translation: Vector3, flicker: number) {
      THRUSTERS.forEach((t, i) => {
        const plume = plumes[i];
        if (!plume) return;
        const k = thrusterIntensity(t, rotation, translation);
        plume.visible = k > 0.02;
        const length = (0.4 + 0.6 * k) * flicker;
        plume.scale.set(0.6 + 0.4 * k, length, 0.6 + 0.4 * k);
      });
    },
  };
}
