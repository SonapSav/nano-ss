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
  Scene,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import { createBrightness, createPointCloud, type Brightness } from './pointCloud';
import { createRcsPlumes } from './rcsThrusters';
import { createSpaceDust } from './spaceDust';

/** Target box position in world coordinates (m): 2 km ahead of the start point. */
export const TARGET_POSITION = new Vector3(0, 0, -2000);

/** Small deterministic random generator, so the starfield is the same every run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Procedural starfield at "infinity"; the real star catalogue comes in Stage 3. */
function createStars(count: number, radius: number) {
  const random = mulberry32(1969);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const tint = new Color();
  for (let i = 0; i < count; i++) {
    // Uniform direction on the sphere.
    const z = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    positions.set([r * Math.cos(phi) * radius, z * radius, r * Math.sin(phi) * radius], i * 3);
    // Few bright stars, many faint ones.
    const brightness = Math.pow(random(), 4) * 0.9 + 0.1;
    tint.setHSL(random() < 0.5 ? 0.6 : 0.1, random() * 0.4, 0.75);
    colors.set([tint.r * brightness, tint.g * brightness, tint.b * brightness], i * 3);
    sizes[i] = brightness > 0.6 ? 3 : brightness > 0.25 ? 2 : 1.5;
  }
  const { sprite: stars } = createPointCloud(positions, colors, sizes);
  stars.renderOrder = -1;
  return stars;
}

/** Navigation beacons every 500 m in a cube around the start, so motion is visible. */
function createBeacons(blink: Brightness) {
  const spacing = 500;
  const steps = 4; // -2 km to +2 km
  const points: number[] = [];
  for (let x = -steps; x <= steps; x++)
    for (let y = -steps; y <= steps; y++)
      for (let z = -steps; z <= steps; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        points.push(x * spacing, y * spacing, z * spacing);
      }
  const count = points.length / 3;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([1, 0.6, 0.15], i * 3);
  return createPointCloud(new Float32Array(points), colors, new Float32Array(count).fill(4), {
    brightness: blink,
  }).sprite;
}

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

  return { ship, engineGlow, glowMaterial, retroGlows, retroMaterial };
}

/**
 * Stage 1 scene, camera-relative: the ship stays at the render origin and
 * `worldRoot` is placed at minus the ship's 64-bit world position each frame.
 */
export function createSpaceScene() {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  // One hard sun, plus a faint fill standing in for light reflected off a planet.
  const sun = new DirectionalLight(0xffffff, 4);
  sun.position.set(1, 0.45, 0.6);
  scene.add(sun, new AmbientLight(0x334466, 0.06));

  const stars = createStars(4000, 50_000);
  scene.add(stars);

  const worldRoot = new Group();
  scene.add(worldRoot);

  const blink = createBrightness();
  worldRoot.add(createBeacons(blink));

  const target = new Mesh(
    new BoxGeometry(20, 10, 30),
    new MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.6, roughness: 0.4 }),
  );
  target.position.copy(TARGET_POSITION);
  worldRoot.add(target);

  const { ship, engineGlow, glowMaterial, retroGlows, retroMaterial } = createShipModel();
  const plumes = createRcsPlumes();
  ship.add(plumes.group);
  scene.add(ship);

  const dust = createSpaceDust();
  scene.add(dust.sprite);

  return {
    scene,
    ship,
    update(
      shipWorldPosition: Vector3,
      cameraPosition: Vector3,
      throttle: number,
      retro: number,
      rcs: { rotation: Vector3; translation: Vector3 },
      showDust: boolean,
      timeSeconds: number,
    ) {
      // 64-bit subtraction happens here, on the CPU, before anything reaches the GPU.
      worldRoot.position.copy(shipWorldPosition).negate();
      stars.position.copy(cameraPosition);
      blink.value = Math.sin(timeSeconds * Math.PI) > 0.6 ? 1 : 0.25;
      engineGlow.visible = throttle > 0.001;
      engineGlow.scale.set(0.6 + throttle * 0.6, 0.6 + throttle * 0.6, 1 + throttle * 3);
      glowMaterial.opacity = 0.35 + throttle * 0.65;
      for (const g of retroGlows) {
        g.visible = retro > 0.001;
        g.scale.set(0.7 + retro * 0.5, 0.7 + retro * 0.5, 1 + retro * 4);
      }
      retroMaterial.opacity = 0.35 + retro * 0.65;
      plumes.update(rcs.rotation, rcs.translation, 0.85 + 0.15 * Math.sin(timeSeconds * 60));
      dust.sprite.visible = showDust;
      if (showDust) dust.update(shipWorldPosition);
    },
  };
}
