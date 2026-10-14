import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three/webgpu';
import type { OrbitElements } from '../world/orbit';

const _p = new Vector3();
const _q = new Vector3();
const _n = new Vector3();

/** Unit vectors of the orbit plane: toward periapsis (P) and 90° ahead (Q). */
function perifocalBasis(el: OrbitElements): [Vector3, Vector3] {
  _n.copy(el.hVector).normalize();
  if (el.eccentricity > 1e-6) {
    _p.copy(el.eVector).normalize();
  } else {
    // Circular: any direction in the plane will do.
    _p.set(1, 0, 0);
    if (Math.abs(_n.x) > 0.9) _p.set(0, 1, 0);
    _p.addScaledVector(_n, -_p.dot(_n)).normalize();
  }
  _q.crossVectors(_n, _p);
  return [_p, _q];
}

/**
 * Points along the orbit, relative to the body's centre, into `out`
 * (count × 3 floats). Escape orbits are drawn out to `maxRadius`.
 * Returns how many points were written.
 */
export function orbitPoints(el: OrbitElements, maxRadius: number, out: Float32Array): number {
  const count = out.length / 3;
  const e = el.eccentricity;
  const p = el.periapsisRadius * (1 + e); // semi-latus rectum
  const [P, Q] = perifocalBasis(el);
  let from = 0;
  let to = 2 * Math.PI;
  if (e >= 1 || el.apoapsisRadius > maxRadius) {
    // Only the part of the conic inside maxRadius.
    const limit = Math.acos(Math.min(1, Math.max(-1, (p / maxRadius - 1) / e)));
    from = -limit;
    to = limit;
  }
  for (let i = 0; i < count; i++) {
    const nu = from + ((to - from) * i) / (count - 1);
    const r = p / (1 + e * Math.cos(nu));
    out[i * 3] = r * (Math.cos(nu) * P.x + Math.sin(nu) * Q.x);
    out[i * 3 + 1] = r * (Math.cos(nu) * P.y + Math.sin(nu) * Q.y);
    out[i * 3 + 2] = r * (Math.cos(nu) * P.z + Math.sin(nu) * Q.z);
  }
  return count;
}

/** Periapsis and apoapsis positions relative to the body's centre (apoapsis null for escape orbits). */
export function apsides(el: OrbitElements): { periapsis: Vector3; apoapsis: Vector3 | null } {
  const [P] = perifocalBasis(el);
  return {
    periapsis: P.clone().multiplyScalar(el.periapsisRadius),
    apoapsis: Number.isFinite(el.apoapsisRadius)
      ? P.clone().multiplyScalar(-el.apoapsisRadius)
      : null,
  };
}

/** A polyline object whose points are rewritten as the orbit changes. */
export function createOrbitLine(color: number, points = 360) {
  const positions = new Float32Array(points * 3);
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);
  const line = new Line(
    geometry,
    new LineBasicMaterial({ color, transparent: true, opacity: 0.7 }),
  );
  line.frustumCulled = false;
  return {
    line,
    positions,
    commit() {
      attribute.needsUpdate = true;
    },
  };
}
