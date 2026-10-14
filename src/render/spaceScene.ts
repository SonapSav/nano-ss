import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Scene,
  SpotLight,
  SphereGeometry,
  Vector3,
  type Quaternion,
  type Sprite,
  type Texture,
} from 'three/webgpu';
import type { OrbitElements } from '../world/orbit';
import { EARTH, MOON } from '../world/bodies';
import { createHyperStreaks } from './hyperStreaks';
import { createOrbitLine, orbitPoints } from './orbitLine';
import { createEarth, createMoon } from './planets';
import { createSun } from './sun';
import type { Spaceport } from '../world/sites';
import type { TextureName } from './textures';
import { createRcsPlumes } from './rcsThrusters';
import { createSpaceDust } from './spaceDust';

/**
 * Greybox spacecraft (D-043): about 9 m long, no wings. Nose toward -Z, main
 * engine at the tail, landing legs at the tail for vertical landings, two
 * retro nozzles at the nose (D-042), and side RCS pods for roll.
 */
function createShipModel() {
  const hull = new MeshStandardMaterial({ color: 0xd8dade, metalness: 0.3, roughness: 0.5 });
  const dark = new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.4, roughness: 0.6 });
  const ship = new Group();
  const alongZ = (mesh: Mesh) => {
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };

  const body = alongZ(new Mesh(new CylinderGeometry(1.3, 1.4, 6.2, 8), hull));
  body.position.z = 0.5;
  ship.add(body);

  const nose = new Mesh(new ConeGeometry(1.3, 2.2, 8).rotateX(-Math.PI / 2), hull);
  nose.position.z = -3.7;
  ship.add(nose);

  const windows = new Mesh(new BoxGeometry(1.2, 0.3, 0.9), dark);
  windows.position.set(0, 0.85, -3.1);
  windows.rotation.x = -0.45;
  ship.add(windows);

  const bell = alongZ(new Mesh(new CylinderGeometry(0.5, 0.9, 1.1, 16, 1, true), dark));
  bell.position.z = 4.15;
  ship.add(bell);

  for (const side of [-1, 1]) {
    const retro = alongZ(new Mesh(new CylinderGeometry(0.16, 0.12, 0.5, 10, 1, true), dark));
    retro.position.set(side * 0.75, 0, -3.35);
    ship.add(retro);

    const pod = new Mesh(new BoxGeometry(0.35, 0.35, 0.8), dark);
    pod.position.set(side * 1.45, 0, 0.4);
    ship.add(pod);
  }

  // Landing legs: struts from the hull out and back to footpads behind the engine.
  for (let k = 0; k < 4; k++) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    const top = new Vector3(Math.cos(angle) * 1.3, Math.sin(angle) * 1.3, 2.4);
    const foot = new Vector3(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 5.0);
    const strut = new Mesh(new CylinderGeometry(0.09, 0.09, top.distanceTo(foot), 6), dark);
    strut.position.copy(top).add(foot).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), foot.clone().sub(top).normalize());
    ship.add(strut);
    const pad = alongZ(new Mesh(new CylinderGeometry(0.35, 0.35, 0.08, 12), dark));
    pad.position.copy(foot);
    ship.add(pad);
  }

  const glow = (color: number) =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
  const glowMaterial = glow(0xffa040);
  const engineGlow = new Mesh(new SphereGeometry(0.5, 16, 8), glowMaterial);
  engineGlow.position.set(0, 0, 4.9);
  ship.add(engineGlow);

  const retroMaterial = glow(0xffb060);
  const retroGlows = [-1, 1].map((side) => {
    const g = new Mesh(new SphereGeometry(0.18, 12, 6), retroMaterial);
    g.position.set(side * 0.75, 0, -3.75);
    ship.add(g);
    return g;
  });

  // Navigation lights (red left, green right, white strobe at the tail), visible in Earth's shadow.
  const navLight = (color: number, position: [number, number, number]) => {
    const light = new Mesh(new SphereGeometry(0.09, 8, 4), new MeshBasicMaterial({ color }));
    light.position.set(...position);
    ship.add(light);
    return light;
  };
  navLight(0xff2020, [-1.62, 0, 0.4]);
  navLight(0x20ff40, [1.62, 0, 0.4]);
  const strobe = navLight(0xffffff, [0, 1.45, 3.2]);

  // Hull floodlights: a short-range light that only reaches the ship itself.
  const flood = new PointLight(0xdde6ff, 2, 14, 1.5);
  flood.position.set(0, 3, 6);
  ship.add(flood);

  // Landing lights: two spots beside the engine, shining down past the legs (tail-down landings).
  // Always in the scene and dimmed to 0 when off, so switching them does not rebuild shaders.
  const landingLights = [-1, 1].map((side) => {
    const spot = new SpotLight(0xfff4e0, 0, 0, 0.6, 0.5, 2);
    spot.position.set(side * 1.0, 0, 3.6);
    spot.target.position.set(side * 3, 0, 40);
    ship.add(spot, spot.target);
    return spot;
  });

  return { ship, engineGlow, glowMaterial, retroGlows, retroMaterial, strobe, landingLights };
}

export interface SceneFrame {
  /** Ship position, Earth-centred inertial (m, 64-bit). */
  ship: Vector3;
  cameraPosition: Vector3;
  moon: Vector3;
  sun: Vector3;
  target: Vector3;
  /** Earth's rotation angle (Greenwich sidereal time, rad). */
  earthRotation: number;
  throttle: number;
  retro: number;
  rcs: { rotation: Vector3; translation: Vector3 };
  moonVelocity: Vector3;
  /** The Moon-fixed frame's orientation (from the world, shared with physics). */
  moonOrientation: Quaternion;
  /**
   * Sun shadows from terrain and ship (near the lunar surface; Stage 5): a
   * point fixed to the ground (Earth-centred) that the shadow map's texels are
   * snapped to, so they do not crawl as the ship moves; null for no shadows.
   */
  shadows: Vector3 | null;
  /** Map view: shows the Moon's orbit line. */
  mapView: boolean;
  /** Landing lights (Stage 5), off when null; otherwise their height above the ground (m), for dimming. */
  landingLights: number | null;
  /** Motion dust is shown around the target only when the ship is near it. */
  showDust: boolean;
  timeSeconds: number;
  /** The ship's orbit around the reference body (drawn as a line), or null to hide it. */
  orbit: { elements: OrbitElements; center: Vector3; maxRadius: number } | null;
  /** Hyperdrive speed in multiples of c while active, else null; and the frame time (s). */
  hyperSpeed: number | null;
  dt: number;
}

/** True if `p` is inside Earth's shadow (cylinder model; the umbra cone is ignored). */
export function inEarthShadow(p: Vector3, sun: Vector3): boolean {
  return blocked(p, sun, ORIGIN, EARTH.radius);
}

/** True if a sphere (centre, radius) blocks the line of sight from `p` toward the point `toward`. */
export function blocked(p: Vector3, toward: Vector3, center: Vector3, radius: number): boolean {
  const direction = _sightDir.subVectors(toward, p).normalize();
  const m = _sightOffset.subVectors(center, p);
  const along = m.dot(direction);
  if (along < 0) return false;
  return m.lengthSq() - along * along < radius * radius;
}
const ORIGIN = new Vector3();
const _sightDir = new Vector3();
const _sightOffset = new Vector3();
const _sunDir = new Vector3();
const _shipDir = new Vector3();
/** Earthshine intensity with a fully lit Earth (a game-friendly brightness, not photometric). */
const EARTHSHINE = 1.5;

/**
 * Camera-relative scene: the ship stays at the render origin and `worldRoot`
 * (the Earth-centred frame) sits at minus the ship's 64-bit position, so
 * three.js combines the large offsets in 64-bit before anything reaches the GPU.
 */
/** Landing light intensity (cd): about sunlight on the ground from 30 m up; and the brightest pool allowed. */
const LANDING_LIGHT = 5_000;
const LANDING_GLARE = 20;

/** Shadow camera half-size and distance from the ship (m). */
const SHADOW_HALF = 1_500;
const SHADOW_DISTANCE = 8_000;
const SHADOW_MAP_SIZE = 2048;
/** One shadow-map texel on the ground (m). */
const SHADOW_TEXEL = (2 * SHADOW_HALF) / SHADOW_MAP_SIZE;
const UP = new Vector3(0, 1, 0);
const _right = new Vector3();
const _upward = new Vector3();
const _anchor = new Vector3();

export interface SceneAssets {
  textures: Partial<Record<TextureName, Texture>>;
  stars: Sprite;
  /** The Moon's path around Earth for the coming month, Earth-centred (m). */
  moonOrbit: Float32Array;
  spaceports: readonly Spaceport[];
}

export function createSpaceScene(assets: SceneAssets) {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  // Sunlight from the real Sun direction, plus a faint fill standing in for earthshine.
  const sun = new DirectionalLight(0xffffff, 4);
  scene.add(sun, sun.target, new AmbientLight(0x334466, 0.06));
  // Earthshine: sunlight reflected by Earth, from Earth's direction, scaled by how much of Earth is lit.
  const earthshine = new DirectionalLight(0x9db8ff, 0);
  scene.add(earthshine, earthshine.target);
  // Shadows over a few km around the ship (the ship stays at the render origin).
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -SHADOW_HALF;
  shadowCamera.right = shadowCamera.top = SHADOW_HALF;
  shadowCamera.near = 1;
  shadowCamera.far = SHADOW_DISTANCE * 2;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  const sunDisc = createSun();
  scene.add(sunDisc.group);

  const stars = assets.stars;
  scene.add(stars);

  const worldRoot = new Group();
  scene.add(worldRoot);

  const earth = createEarth(assets.textures);
  worldRoot.add(earth.mesh);
  const moon = createMoon(assets.textures, assets.spaceports);
  worldRoot.add(moon.mesh);

  const orbitLine = createOrbitLine(0x5fd4ff);
  worldRoot.add(orbitLine.line);
  const moonOrbitLine = createOrbitLine(0x8a8aa0, assets.moonOrbit.length / 3);
  moonOrbitLine.positions.set(assets.moonOrbit);
  moonOrbitLine.commit();
  worldRoot.add(moonOrbitLine.line);

  const target = new Mesh(
    new BoxGeometry(20, 10, 30),
    new MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.6, roughness: 0.4 }),
  );
  worldRoot.add(target);

  const { ship, engineGlow, glowMaterial, retroGlows, retroMaterial, strobe, landingLights } =
    createShipModel();
  // The hull casts a shadow on the ground (glows and lights do not).
  ship.traverse((o) => {
    if (o instanceof Mesh && o.material instanceof MeshStandardMaterial) o.castShadow = true;
  });
  const plumes = createRcsPlumes();
  ship.add(plumes.group);
  const streaks = createHyperStreaks();
  ship.add(streaks.lines);
  scene.add(ship);

  const dust = createSpaceDust();
  scene.add(dust.sprite);
  const shipFromTarget = new Vector3();

  return {
    scene,
    ship,
    update(f: SceneFrame) {
      // 64-bit subtraction happens here, on the CPU, before anything reaches the GPU.
      worldRoot.position.copy(f.ship).negate();
      moon.update(f.moon, f.moonOrientation, f.timeSeconds);
      target.position.copy(f.target);
      stars.position.copy(f.cameraPosition);

      _sunDir.copy(f.sun).normalize();
      // No sunlight in Earth's shadow, or at night on the Moon (the Sun below the horizon).
      const sunlit = !inEarthShadow(f.ship, f.sun) && !blocked(f.ship, f.sun, f.moon, MOON.radius);
      sun.intensity = sunlit ? 4 : 0;
      // The light sits toward the Sun at shadow-camera distance, aimed near the ship: at the
      // point whose offset from the ground anchor is a whole number of shadow texels across
      // the light (the axes three.js's lookAt gives the shadow camera), so texels stay put.
      sun.target.position.set(0, 0, 0);
      if (f.shadows) {
        _right.crossVectors(UP, _sunDir).normalize();
        _upward.crossVectors(_sunDir, _right);
        _anchor.subVectors(f.shadows, f.ship);
        for (const axis of [_right, _upward]) {
          const along = -_anchor.dot(axis);
          sun.target.position.addScaledVector(
            axis,
            Math.round(along / SHADOW_TEXEL) * SHADOW_TEXEL - along,
          );
        }
      }
      sun.position.copy(sun.target.position).addScaledVector(_sunDir, SHADOW_DISTANCE);
      sun.castShadow = f.shadows !== null && sunlit;
      // Earth sits at the Earth-centred origin, i.e. at -ship in render space.
      earthshine.position.copy(f.ship).negate().normalize();
      const litFraction = (1 + _sunDir.dot(_shipDir.copy(f.ship).normalize())) / 2;
      // On the Moon's far side (or behind it) Earth is below the horizon.
      earthshine.intensity = blocked(f.ship, ORIGIN, f.moon, MOON.radius)
        ? 0
        : EARTHSHINE * litFraction;
      earth.update(f.earthRotation, _sunDir);
      sunDisc.update(f.sun);

      streaks.update(f.hyperSpeed !== null, f.hyperSpeed ?? 0, f.dt);
      moonOrbitLine.line.visible = f.mapView;
      // Dimmed near the ground, so the pool under the ship never glares (about LANDING_GLARE at most).
      const lightHeight = f.landingLights === null ? 0 : Math.max(0.5, f.landingLights);
      const dimming = Math.min(1, (LANDING_GLARE * lightHeight * lightHeight) / LANDING_LIGHT);
      for (const spot of landingLights)
        spot.intensity = f.landingLights === null ? 0 : LANDING_LIGHT * dimming;
      orbitLine.line.visible = f.orbit !== null;
      if (f.orbit) {
        orbitPoints(f.orbit.elements, f.orbit.maxRadius, orbitLine.positions);
        orbitLine.line.position.copy(f.orbit.center);
        orbitLine.commit();
      }
      strobe.visible = f.timeSeconds % 1.5 < 0.08;

      engineGlow.visible = f.throttle > 0.001;
      engineGlow.scale.set(0.6 + f.throttle * 0.6, 0.6 + f.throttle * 0.6, 1 + f.throttle * 3);
      glowMaterial.opacity = 0.35 + f.throttle * 0.65;
      for (const g of retroGlows) {
        g.visible = f.retro > 0.001;
        g.scale.set(0.7 + f.retro * 0.5, 0.7 + f.retro * 0.5, 1 + f.retro * 4);
      }
      retroMaterial.opacity = 0.35 + f.retro * 0.65;
      plumes.update(f.rcs.rotation, f.rcs.translation, 0.85 + 0.15 * Math.sin(f.timeSeconds * 60));

      dust.sprite.visible = f.showDust;
      // Dust is fixed in the target's frame, so it shows motion relative to the target.
      if (f.showDust) dust.update(shipFromTarget.subVectors(f.ship, f.target));
    },
  };
}
