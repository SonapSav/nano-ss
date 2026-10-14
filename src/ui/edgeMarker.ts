/** Where an off-screen marker's arrow sits on the screen edge. */
export interface EdgePosition {
  /** Normalized device coordinates, -1..1 (y up). */
  x: number;
  y: number;
  /** Direction from screen centre toward the marker, radians (0 = right, counter-clockwise). */
  angle: number;
}

/**
 * Places an arrow on the screen border for a marker that is off screen or
 * behind the camera. `x`, `y` is the marker's direction on screen: projected
 * NDC when it is in front, the camera-space direction when it is behind.
 */
export function edgeMarkerPosition(x: number, y: number, margin = 0.9): EdgePosition {
  if (x === 0 && y === 0) return { x: 0, y: -margin, angle: -Math.PI / 2 }; // straight behind: bottom
  const k = margin / Math.max(Math.abs(x), Math.abs(y));
  return { x: x * k, y: y * k, angle: Math.atan2(y, x) };
}
