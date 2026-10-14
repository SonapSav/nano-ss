import type { ShipConfig } from '../ship';

/**
 * Greybox spaceplane, Dream Chaser class (chosen 2026-10-14). Numbers are
 * plausible placeholders, tunable once the real design exists:
 * - about 9 m long, 7 m span, 10 t dry, 8 t main propellant;
 * - main engine 120 kN at Isp 340 s: about 0.7 g full, 1.2 g nearly empty,
 *   about 220 s of burn and roughly 1.9 km/s of delta-v;
 * - RCS: 4 kN per translation axis; torques give about 3°/s² in pitch and
 *   yaw and 6°/s² in roll when full.
 */
export const placeholderSpaceplane: ShipConfig = {
  name: 'Greybox spaceplane',
  // Effective box for the inertia estimate: thin wings count as a narrower body.
  inertiaBox: { width: 4, height: 2.5, length: 9 },
  dryMass: 10_000,
  mainPropellantCapacity: 8_000,
  rcsPropellantCapacity: 300,
  mainEngine: { thrust: 120_000, isp: 340 },
  rcs: {
    force: 4_000,
    torque: { x: 7_000, y: 7_700, z: 3_500 },
    leverArm: { x: 4, y: 4, z: 2 },
    isp: 220,
  },
};
