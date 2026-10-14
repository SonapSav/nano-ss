import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three/webgpu';

export type CameraMode = 'chase' | 'nose';

/** Nose camera position in body coordinates (m): at the nose, slightly up. */
const NOSE_OFFSET = new Vector3(0, 0.5, -4.2);
/** How fast the chase camera follows the ship's rotation (1/s). */
const CHASE_FOLLOW = 4;

/**
 * Chase camera (behind and above, smoothed, mouse orbit and zoom) and nose
 * camera. The ship sits at the render origin (camera-relative rendering).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  mode: CameraMode = 'chase';
  private readonly follow = new Quaternion();
  private initialized = false;
  private orbitYaw = 0;
  private orbitPitch = -0.18;
  private distance = 18;

  private readonly offset = new Vector3();
  private readonly orbit = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(60, aspect, 0.1, 200_000);
  }

  /** Mouse drag orbits the chase camera; the wheel zooms. */
  attach(element: HTMLElement): void {
    let dragging = false;
    element.addEventListener('pointerdown', (e) => {
      dragging = true;
      element.setPointerCapture(e.pointerId);
    });
    element.addEventListener('pointerup', () => (dragging = false));
    element.addEventListener('pointermove', (e) => {
      if (!dragging || this.mode !== 'chase') return;
      this.orbitYaw -= e.movementX * 0.005;
      this.orbitPitch = Math.max(-1.4, Math.min(1.4, this.orbitPitch - e.movementY * 0.005));
    });
    element.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = Math.max(8, Math.min(200, this.distance * Math.exp(e.deltaY * 0.001)));
      },
      { passive: false },
    );
  }

  toggle(): void {
    this.mode = this.mode === 'chase' ? 'nose' : 'chase';
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(shipOrientation: Quaternion, dt: number): void {
    const cam = this.camera;
    if (!this.initialized) {
      this.follow.copy(shipOrientation);
      this.initialized = true;
    }

    if (this.mode === 'nose') {
      this.follow.copy(shipOrientation);
      cam.position.copy(NOSE_OFFSET).applyQuaternion(shipOrientation);
      cam.quaternion.copy(shipOrientation);
    } else {
      this.follow.slerp(shipOrientation, 1 - Math.exp(-CHASE_FOLLOW * dt));
      this.orbit.setFromEuler(this.euler.set(this.orbitPitch, this.orbitYaw, 0));
      this.offset.set(0, 0, this.distance).applyQuaternion(this.orbit).applyQuaternion(this.follow);
      cam.position.copy(this.offset);
      cam.up.set(0, 1, 0).applyQuaternion(this.follow);
      cam.lookAt(0, 0, 0);
    }
    cam.updateMatrixWorld();
  }
}
