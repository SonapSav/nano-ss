import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from 'three/webgpu';

/**
 * Stand-in scene for Stage 0: space-style lighting (one hard sun, almost no
 * ambient) on a single metallic object, enough to prove the render pipeline.
 */
export function createPlaceholderScene(aspect: number) {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  const sun = new DirectionalLight(0xffffff, 4);
  sun.position.set(5, 2, 3);
  scene.add(sun);
  // Faint fill standing in for light reflected off a nearby planet.
  scene.add(new AmbientLight(0x334466, 0.08));

  const hull = new Mesh(
    new BoxGeometry(1.2, 0.6, 2),
    new MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.35 }),
  );
  scene.add(hull);

  const camera = new PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(0, 1, 4.5);
  camera.lookAt(hull.position);

  return {
    scene,
    camera,
    update(dtSeconds: number) {
      hull.rotation.y += dtSeconds * 0.4;
      hull.rotation.x += dtSeconds * 0.1;
    },
    resize(newAspect: number) {
      camera.aspect = newAspect;
      camera.updateProjectionMatrix();
    },
  };
}
