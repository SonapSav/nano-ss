import { Quaternion, Vector3 } from 'three/webgpu';

/**
 * Rigid body state in an inertial frame. All values are 64-bit (JavaScript
 * numbers); only render-space offsets ever reach the GPU.
 *
 * Body axes: +X right, +Y up, -Z forward (the three.js camera convention).
 * Angular velocity is in the body frame, in rad/s.
 */
export interface BodyState {
  position: Vector3;
  velocity: Vector3;
  orientation: Quaternion;
  angularVelocity: Vector3;
}

/** Principal moments of inertia about the body axes, in kg·m². */
export interface Inertia {
  x: number;
  y: number;
  z: number;
}

export function createBodyState(): BodyState {
  return {
    position: new Vector3(),
    velocity: new Vector3(),
    orientation: new Quaternion(),
    angularVelocity: new Vector3(),
  };
}

export function copyBodyState(from: BodyState, to: BodyState): void {
  to.position.copy(from.position);
  to.velocity.copy(from.velocity);
  to.orientation.copy(from.orientation);
  to.angularVelocity.copy(from.angularVelocity);
}

/** Euler's rotation equations for principal axes: I·ω̇ = τ − ω × (I·ω). */
function angularAcceleration(w: Vector3, torque: Vector3, inertia: Inertia, out: Vector3): Vector3 {
  return out.set(
    (torque.x - (inertia.z - inertia.y) * w.y * w.z) / inertia.x,
    (torque.y - (inertia.x - inertia.z) * w.z * w.x) / inertia.y,
    (torque.z - (inertia.y - inertia.x) * w.x * w.y) / inertia.z,
  );
}

const _k1 = new Vector3();
const _k2 = new Vector3();
const _k3 = new Vector3();
const _k4 = new Vector3();
const _w = new Vector3();
const _axis = new Vector3();
const _dq = new Quaternion();

/**
 * Advances the body by `dt` seconds.
 * - Linear motion: semi-implicit Euler with `forceWorld` (N) and `mass` (kg).
 * - Angular velocity: RK4 on Euler's equations, so torque-free tumbling and
 *   precession behave physically with little energy drift.
 * - Orientation: exact rotation by the mean angular velocity over the step.
 */
export function integrateBody(
  state: BodyState,
  forceWorld: Vector3,
  torqueBody: Vector3,
  mass: number,
  inertia: Inertia,
  dt: number,
): void {
  state.velocity.addScaledVector(forceWorld, dt / mass);
  state.position.addScaledVector(state.velocity, dt);

  const w0 = state.angularVelocity;
  angularAcceleration(w0, torqueBody, inertia, _k1);
  angularAcceleration(_w.copy(w0).addScaledVector(_k1, dt / 2), torqueBody, inertia, _k2);
  angularAcceleration(_w.copy(w0).addScaledVector(_k2, dt / 2), torqueBody, inertia, _k3);
  angularAcceleration(_w.copy(w0).addScaledVector(_k3, dt), torqueBody, inertia, _k4);
  // Mean ω over the step (ω0 plus half the RK4 increment) drives the orientation update.
  const wMean = _w
    .copy(w0)
    .addScaledVector(_k1, dt / 12)
    .addScaledVector(_k2, dt / 6)
    .addScaledVector(_k3, dt / 6)
    .addScaledVector(_k4, dt / 12);
  rotateByBodyRate(state.orientation, wMean, dt);

  w0.addScaledVector(_k1, dt / 6)
    .addScaledVector(_k2, dt / 3)
    .addScaledVector(_k3, dt / 3)
    .addScaledVector(_k4, dt / 6);
}

/** Applies a body-frame angular velocity for `dt` seconds (exact for constant ω). */
function rotateByBodyRate(q: Quaternion, w: Vector3, dt: number): void {
  const rate = w.length();
  if (rate * dt < 1e-12) return;
  _axis.copy(w).divideScalar(rate);
  _dq.setFromAxisAngle(_axis, rate * dt);
  q.multiply(_dq).normalize();
}

/** Angular momentum in the inertial frame, in kg·m²/s. */
export function angularMomentumWorld(state: BodyState, inertia: Inertia, out: Vector3): Vector3 {
  const w = state.angularVelocity;
  return out
    .set(inertia.x * w.x, inertia.y * w.y, inertia.z * w.z)
    .applyQuaternion(state.orientation);
}

/** Rotational kinetic energy, in J. */
export function rotationalEnergy(state: BodyState, inertia: Inertia): number {
  const w = state.angularVelocity;
  return 0.5 * (inertia.x * w.x * w.x + inertia.y * w.y * w.y + inertia.z * w.z * w.z);
}
