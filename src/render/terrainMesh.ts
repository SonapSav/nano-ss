import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Vector3,
  type Texture,
} from 'three/webgpu';
import {
  abs,
  asin,
  atan,
  dFdx,
  dFdy,
  float,
  max,
  mix,
  positionLocal,
  round,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Site } from '../world/terrain';

/**
 * Three nested grids whose edges fall on each other's grid lines:
 * ring ±200 km at 2 km, window ±20 km at 160 m, and about 2 km around the
 * pad at 8 m. Skirts hide the small cracks where a fine edge meets a coarse one.
 */
const RING_CELLS = 200; // 2 km
const WINDOW_CELLS = 250; // 160 m
const INNER_COARSE_CELLS = 13; // window cells covered by the inner grid (about 2 km)
const INNER_SPLIT = 20; // inner cells per window cell: 8 m
const SKIRT = 300;

const _p = new Vector3();

/**
 * Grid of terrain on the site's tangent plane, as positions relative to
 * `anchor` (Moon-fixed), so float32 vertices stay precise. Cells for which
 * `skip` is true are left out (the outer grid's hole under the inner grid).
 */
function grid(
  site: Site,
  anchor: Vector3,
  x0: number,
  y0: number,
  size: number,
  cells: number,
  skip?: (x0: number, y0: number, x1: number, y1: number) => boolean,
  skirt = false,
): BufferGeometry {
  const n = cells + 1;
  const E = site.data.halfExtent;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const vertex = (x: number, y: number, drop = 0) => {
    site.surfacePoint(x, y, _p);
    if (drop) _p.setLength(_p.length() - drop);
    _p.sub(anchor);
    positions.push(_p.x, _p.y, _p.z);
    uvs.push((x + E) / (2 * E), (y + E) / (2 * E));
    return positions.length / 3 - 1;
  };
  const step = size / cells;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vertex(x0 + i * step, y0 + j * step);
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      if (skip?.(x0 + i * step, y0 + j * step, x0 + (i + 1) * step, y0 + (j + 1) * step)) continue;
      const a = j * n + i;
      index.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const normals = Array.from(geometry.getAttribute('normal').array);
  if (skirt) {
    // A curtain hanging down from the outer edge, so no gap shows against the sphere.
    // Its vertices take the normal of the ground above them, so the edge is lit like the ground.
    const hang = (i: number, j: number) => {
      const top = j * n + i;
      const low = vertex(x0 + i * step, y0 + j * step, SKIRT);
      normals.push(normals[3 * top] ?? 0, normals[3 * top + 1] ?? 0, normals[3 * top + 2] ?? 0);
      return low;
    };
    const edge: [number, number][] = [];
    for (let i = 0; i < cells; i++) edge.push([i, 0]);
    for (let j = 0; j < cells; j++) edge.push([cells, j]);
    for (let i = cells; i > 0; i--) edge.push([i, cells]);
    for (let j = cells; j > 0; j--) edge.push([0, j]);
    edge.forEach(([i, j], k) => {
      const [i2, j2] = edge[(k + 1) % edge.length] ?? [0, 0];
      const top1 = j * n + i;
      const top2 = j2 * n + i2;
      const low1 = hang(i, j);
      const low2 = hang(i2, j2);
      index.push(top1, low1, top2, top2, low1, low2);
    });
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  return geometry;
}

/** Skip test: the cell lies entirely inside the square [ax, bx] × [ay, by]. */
const within =
  (ax: number, ay: number, bx: number, by: number) =>
  (x0: number, y0: number, x1: number, y1: number) =>
    x0 >= ax - 1e-6 && x1 <= bx + 1e-6 && y0 >= ay - 1e-6 && y1 <= by + 1e-6;

/**
 * Terrain for one spaceport, in Moon-fixed coordinates (add it to the Moon
 * mesh): the 400 km ring, the 40 km window, and the 2 km pad area.
 */
export function createSiteTerrain(
  site: Site,
  colour: Texture | undefined,
  moonColour: Texture,
): Group {
  const group = new Group();
  const anchor = site.padPoint(new Vector3());
  group.position.copy(anchor);
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  // The global Moon map at this point (same mapping as the sphere), with gradients
  // that ignore the longitude wrap so no seam shows where it crosses ±180° (at the pole).
  const direction = positionLocal.add(vec3(anchor)).normalize();
  const globalUv = vec2(
    atan(direction.y, direction.x)
      .div(2 * Math.PI)
      .add(0.5),
    asin(direction.z).div(Math.PI).add(0.5),
  );
  const dx = dFdx(globalUv);
  const dy = dFdy(globalUv);
  const global = texture(moonColour, globalUv).grad(
    vec2(dx.x.sub(round(dx.x)), dx.y),
    vec2(dy.x.sub(round(dy.x)), dy.y),
  );
  // The site's 40 m map inside the window, fading into the global map over its last 2 km;
  // the ring (uv outside 0..1) uses the global map.
  if (colour) {
    const edge = max(abs(uv().x.sub(0.5)), abs(uv().y.sub(0.5))).mul(2);
    material.colorNode = mix(texture(colour), global, smoothstep(float(0.9), float(1), edge));
  } else {
    material.colorNode = global;
  }

  const R = site.data.ringHalfExtent;
  const E = site.data.halfExtent;
  const windowStep = (2 * E) / WINDOW_CELLS;
  // Inner square snapped to window grid lines around the pad.
  const span = INNER_COARSE_CELLS * windowStep;
  const ix = -E + Math.round((site.data.padX - span / 2 + E) / windowStep) * windowStep;
  const iy = -E + Math.round((site.data.padY - span / 2 + E) / windowStep) * windowStep;

  const ring = new Mesh(
    grid(site, anchor, -R, -R, 2 * R, RING_CELLS, within(-E, -E, E, E), true),
    material,
  );
  const window = new Mesh(
    grid(site, anchor, -E, -E, 2 * E, WINDOW_CELLS, within(ix, iy, ix + span, iy + span), true),
    material,
  );
  const inner = new Mesh(
    grid(site, anchor, ix, iy, span, INNER_COARSE_CELLS * INNER_SPLIT, undefined, true),
    material,
  );
  for (const m of [ring, window, inner]) {
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
  }
  return group;
}
