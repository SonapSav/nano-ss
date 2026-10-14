import {
  AdditiveBlending,
  FrontSide,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type Quaternion,
  type Texture,
} from 'three/webgpu';
import {
  Discard,
  Fn,
  color,
  dot,
  float,
  normalView,
  normalWorld,
  positionLocal,
  positionViewDirection,
  pow,
  smoothstep,
  texture,
  uniform,
  vec3,
} from 'three/tsl';
import { EARTH, MOON } from '../world/bodies';
import type { Spaceport } from '../world/sites';
import { createSpaceport } from './spaceport';
import { createSiteTerrain } from './terrainMesh';
import type { TextureName } from './textures';

function required(textures: Partial<Record<TextureName, Texture>>, name: TextureName): Texture {
  const t = textures[name];
  if (!t) throw new Error(`Texture ${name} is missing (run make scenery)`);
  return t;
}

/** Sphere with poles on +Z (Earth's axis in the ICRF frame) and longitude 0 on +X. */
const sphere = (radius: number, w: number, h: number) =>
  new SphereGeometry(radius, w, h).rotateX(Math.PI / 2);

/**
 * Earth from NASA imagery: Blue Marble by day, Black Marble city lights on
 * the night side, a cloud layer, and a thin atmosphere rim lit by the Sun.
 */
export function createEarth(textures: Partial<Record<TextureName, Texture>>) {
  const day = required(textures, 'earth-day');
  const sunDirection = uniform(new Vector3(1, 0, 0));
  const daylight = smoothstep(float(-0.12), float(0.18), dot(normalWorld, sunDirection));

  const surface = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  surface.colorNode = texture(day);
  // City lights only where the Sun is down.
  surface.emissiveNode = texture(required(textures, 'earth-night'))
    .rgb.mul(daylight.oneMinus())
    .mul(1.6);
  const earth = new Mesh(sphere(EARTH.radius, 192, 96), surface);

  const cloudMaterial = new MeshStandardNodeMaterial({
    transparent: true,
    depthWrite: false,
    roughness: 1,
  });
  cloudMaterial.colorNode = vec3(1, 1, 1);
  cloudMaterial.opacityNode = texture(required(textures, 'earth-clouds')).r.mul(0.85);
  const clouds = new Mesh(sphere(EARTH.radius + 10_000, 128, 64), cloudMaterial);
  earth.add(clouds);

  // Atmosphere: a glow toward the limb, on the sunlit side.
  const rimMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: FrontSide,
  });
  const facing = dot(normalView, positionViewDirection).abs();
  rimMaterial.colorNode = color(0x4d8cff).mul(pow(facing.oneMinus(), 3)).mul(daylight).mul(1.4);
  const atmosphere = new Mesh(sphere(EARTH.radius * 1.025, 128, 64), rimMaterial);
  earth.add(atmosphere);

  return {
    mesh: earth,
    /** Orients the globe by Greenwich sidereal time and tells the shader where the Sun is. */
    update(rotation: number, sunDir: Vector3) {
      earth.rotation.set(0, 0, rotation);
      sunDirection.value.copy(sunDir);
    },
  };
}

export function createMoon(
  textures: Partial<Record<TextureName, Texture>>,
  spaceports: readonly Spaceport[],
) {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const surface = texture(required(textures, 'moon-color'));
  // Inside a site's terrain (gnomonic coordinates within the ring), the terrain mesh replaces the sphere.
  const p = positionLocal.normalize();
  let cut: ReturnType<ReturnType<typeof p.dot>['greaterThan']> | null = null;
  for (const { site } of spaceports) {
    const d = p.dot(vec3(site.up));
    const x = p.dot(vec3(site.east)).div(d).mul(MOON.radius).abs();
    const y = p.dot(vec3(site.north)).div(d).mul(MOON.radius).abs();
    const E = site.data.ringHalfExtent;
    const here = d.greaterThan(0).and(x.lessThan(E)).and(y.lessThan(E));
    cut = cut ? cut.or(here) : here;
  }
  const hole = cut;
  material.colorNode = hole
    ? Fn(() => {
        Discard(hole);
        return surface;
      })()
    : surface;
  const relief = textures['moon-normal'];
  if (relief) {
    material.normalMap = relief;
    material.normalScale = new Vector2(1, 1);
  }
  const moon = new Mesh(sphere(MOON.radius, 192, 96), material);

  const ports = spaceports.map((port) => {
    const terrain = createSiteTerrain(
      port.site,
      textures[`site-${port.name}` as TextureName],
      required(textures, 'moon-color'),
    );
    const buildings = createSpaceport(port.site);
    terrain.add(buildings.group);
    moon.add(terrain);
    return buildings;
  });

  return {
    mesh: moon,
    /** Places and orients the Moon from the world's Moon-fixed frame. */
    update(position: Vector3, orientation: Quaternion, timeSeconds: number) {
      moon.position.copy(position);
      moon.quaternion.copy(orientation);
      for (const port of ports) port.update(timeSeconds);
    },
  };
}
