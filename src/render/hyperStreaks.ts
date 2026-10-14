import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from 'three/webgpu';

/**
 * Hyperdrive streaks: line segments in a tube around the ship, in ship
 * coordinates (nose at -Z), flowing backward. Purely visual: their speed and
 * length grow with the logarithm of the real speed.
 */
export function createHyperStreaks(count = 400) {
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const LENGTH = 1200; // tube length (m)
  const base = Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const radius = 25 + random() * 180;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: (random() - 0.5) * LENGTH,
    };
  });
  const positions = new Float32Array(count * 6);
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);
  const material = new LineBasicMaterial({
    color: 0xaad4ff,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  let offset = 0;

  return {
    lines,
    update(active: boolean, speedOverC: number, dt: number) {
      lines.visible = active;
      if (!active) return;
      const k = Math.log10(Math.max(speedOverC, 1e-4) * 1e4); // 0 at 1e-4 c, 6 at 100c
      offset += dt * (150 + k * 220);
      const streak = 10 + k * 25;
      base.forEach((p, i) => {
        const z = ((((p.z + offset) % LENGTH) + LENGTH) % LENGTH) - LENGTH / 2;
        positions.set([p.x, p.y, z, p.x, p.y, z + streak], i * 6);
      });
      attribute.needsUpdate = true;
    },
  };
}
