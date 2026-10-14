import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointsNodeMaterial,
  Scene,
  SphereGeometry,
  Sprite,
  Vector3,
} from 'three/webgpu';
import { instancedBufferAttribute, uniform } from 'three/tsl';

const createBrightness = () => uniform(1);
type Brightness = ReturnType<typeof createBrightness>;

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

/**
 * Screen-sized points (WebGPU points are 1 px natively, so three.js draws
 * them as an instanced Sprite with PointsNodeMaterial).
 */
function createPointCloud(
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  brightness: Brightness = createBrightness(),
) {
  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: false,
  });
  material.positionNode = instancedBufferAttribute(
    new InstancedBufferAttribute(positions, 3),
    'vec3',
  );
  material.colorNode = instancedBufferAttribute<'vec3'>(
    new InstancedBufferAttribute(colors, 3),
    'vec3',
  ).mul(brightness);
  material.sizeNode = instancedBufferAttribute(new InstancedBufferAttribute(sizes, 1), 'float');
  const sprite = new Sprite(material);
  sprite.count = sizes.length;
  sprite.frustumCulled = false;
  return sprite;
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
  const stars = createPointCloud(positions, colors, sizes);
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
  return createPointCloud(new Float32Array(points), colors, new Float32Array(count).fill(4), blink);
}

/** Greybox spaceplane, about 9 m long and 7 m span; nose toward -Z. */
function createShipModel() {
  const hull = new MeshStandardMaterial({ color: 0xd8dade, metalness: 0.25, roughness: 0.55 });
  const dark = new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.4, roughness: 0.6 });
  const ship = new Group();

  const fuselage = new Mesh(new CapsuleGeometry(0.9, 7, 6, 16), hull);
  fuselage.rotation.x = Math.PI / 2;
  ship.add(fuselage);

  const wings = new Mesh(new BoxGeometry(7, 0.12, 2.6), hull);
  wings.position.set(0, -0.35, 1.6);
  ship.add(wings);

  for (const side of [-1, 1]) {
    const fin = new Mesh(new BoxGeometry(0.1, 1.5, 1.6), hull);
    fin.position.set(side * 1.7, 0.4, 2.4);
    fin.rotation.z = side * -0.35;
    ship.add(fin);
  }

  const windows = new Mesh(new BoxGeometry(0.9, 0.25, 0.9), dark);
  windows.position.set(0, 0.62, -2.9);
  ship.add(windows);

  const nozzle = new Mesh(new CylinderGeometry(0.35, 0.55, 0.7, 16, 1, true), dark);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0, 4.7);
  ship.add(nozzle);

  const glowMaterial = new MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const engineGlow = new Mesh(new SphereGeometry(0.45, 16, 8), glowMaterial);
  engineGlow.position.set(0, 0, 5.2);
  ship.add(engineGlow);

  return { ship, engineGlow, glowMaterial };
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

  const { ship, engineGlow, glowMaterial } = createShipModel();
  scene.add(ship);

  return {
    scene,
    ship,
    update(
      shipWorldPosition: Vector3,
      cameraPosition: Vector3,
      throttle: number,
      timeSeconds: number,
    ) {
      // 64-bit subtraction happens here, on the CPU, before anything reaches the GPU.
      worldRoot.position.copy(shipWorldPosition).negate();
      stars.position.copy(cameraPosition);
      blink.value = Math.sin(timeSeconds * Math.PI) > 0.6 ? 1 : 0.25;
      engineGlow.visible = throttle > 0.001;
      engineGlow.scale.set(0.6 + throttle * 0.6, 0.6 + throttle * 0.6, 1 + throttle * 3);
      glowMaterial.opacity = 0.35 + throttle * 0.65;
    },
  };
}
