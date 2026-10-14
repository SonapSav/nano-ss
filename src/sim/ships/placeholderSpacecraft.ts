import type { ShipConfig } from '../ship';

/**
 * Greybox spacecraft (D-043: no wings, lands vertically everywhere). Masses
 * and engines follow the earlier Dream Chaser-class choice (D-037), tunable
 * once the real design exists:
 * - about 9 m long and 3 m across, 10 t dry, 8 t main propellant;
 * - main engine 120 kN at Isp 340 s: about 0.7 g full, 1.2 g nearly empty,
 *   about 220 s of burn and roughly 1.9 km/s of delta-v;
 * - retro engines in the nose, 40 kN at Isp 320 s, same tank (D-042);
 * - RCS: 800 kg tank, 2 kN per translation axis (about 0.1 m/s², gentle for
 *   docking), torques give about 3°/s² in pitch and yaw and 6°/s² in roll
 *   when full (D-039).
 */
export const placeholderSpacecraft: ShipConfig = {
  name: 'Greybox spacecraft',
  inertiaBox: { width: 3, height: 3, length: 9 },
  dryMass: 10_000,
  mainPropellantCapacity: 8_000,
  rcsPropellantCapacity: 800,
  mainEngine: { thrust: 120_000, isp: 340 },
  retroEngine: { thrust: 40_000, isp: 320 },
  rcs: {
    force: 2_000,
    torque: { x: 7_000, y: 7_700, z: 3_500 },
    leverArm: { x: 4, y: 4, z: 1.5 },
    isp: 220,
  },
};
