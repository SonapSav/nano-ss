/** Physical constants for the Earth–Moon system (SI units). */
export interface BodyInfo {
  name: 'Earth' | 'Moon';
  /** Gravitational parameter GM (m³/s²). */
  gm: number;
  /** Mean radius (m). */
  radius: number;
  /** Altitude below which the ship is lost (m): Earth's atmosphere (D-044), the Moon's surface. */
  hazardAltitude: number;
  /** Warp safety: time warp drops to 1× if the ship is predicted below this altitude (m). */
  warpSafeAltitude: number;
}

export const EARTH: BodyInfo = {
  name: 'Earth',
  gm: 3.986004418e14,
  radius: 6_371_000,
  hazardAltitude: 100_000,
  warpSafeAltitude: 150_000,
};

export const MOON: BodyInfo = {
  name: 'Moon',
  gm: 4.9048695e12,
  radius: 1_737_400,
  hazardAltitude: 0,
  warpSafeAltitude: 20_000,
};

/** Earth's axial tilt (rad), for orienting the globe. */
export const EARTH_OBLIQUITY = (23.4392911 * Math.PI) / 180;

/** Mean Earth–Moon distance (m). */
export const MOON_SEMI_MAJOR_AXIS = 384_400_000;

/** The Moon's sphere of influence: inside it, orbits are shown and measured around the Moon (m). */
export const MOON_SOI = MOON_SEMI_MAJOR_AXIS * Math.pow(MOON.gm / EARTH.gm, 2 / 5);
