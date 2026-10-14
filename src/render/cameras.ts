import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three/webgpu';

export type CameraMode = 'chase' | 'nose' | 'map';

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
  /** Map view (M): orbit around the body being orbited, with its own angles and zoom. */
  private flightMode: 'chase' | 'nose' = 'chase';
  private mapYaw = 0.6;
  private mapPitch = 0.5;
  private mapDistance = 0;
  private mapMinDistance = 1;

  private readonly offset = new Vector3();
  private readonly orbit = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  constructor(aspect: number) {
    // Far enough for the Sun (1.5·10¹¹ m); the reversed depth buffer keeps near objects sharp.
    this.camera = new PerspectiveCamera(60, aspect, 0.1, 1e12);
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
      if (!dragging) return;
      if (this.mode === 'map') {
        this.mapYaw -= e.movementX * 0.005;
        this.mapPitch = Math.max(-1.5, Math.min(1.5, this.mapPitch + e.movementY * 0.005));
      } else if (this.mode === 'chase') {
        this.orbitYaw -= e.movementX * 0.005;
        this.orbitPitch = Math.max(-1.4, Math.min(1.4, this.orbitPitch - e.movementY * 0.005));
      }
    });
    element.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = Math.exp(e.deltaY * 0.001);
        if (this.mode === 'map') {
          this.mapDistance = Math.max(this.mapMinDistance, Math.min(2e9, this.mapDistance * k));
        } else {
          this.distance = Math.max(8, Math.min(200, this.distance * k));
        }
      },
      { passive: false },
    );
  }

  /** C: chase or nose camera (also leaves the map). */
  toggle(): void {
    this.flightMode =
      this.mode === 'map' ? this.flightMode : this.flightMode === 'chase' ? 'nose' : 'chase';
    this.mode = this.flightMode;
  }

  /** M: map view on and off. */
  toggleMap(): void {
    this.mode = this.mode === 'map' ? this.flightMode : 'map';
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `mapCenter` is the orbited body's centre in render space (relative to the
   * ship) and `mapRadius` its radius, used by the map view.
   */
  update(shipOrientation: Quaternion, dt: number, mapCenter?: Vector3, mapRadius = 1): void {
    const cam = this.camera;
    if (this.mode === 'map' && mapCenter) {
      this.mapMinDistance = mapRadius * 1.3;
      if (this.mapDistance === 0) this.mapDistance = mapRadius * 4.5;
      this.mapDistance = Math.max(this.mapDistance, this.mapMinDistance);
      // Spherical position around the body, with +Z (north) up.
      const cp = Math.cos(this.mapPitch);
      cam.position
        .set(Math.cos(this.mapYaw) * cp, Math.sin(this.mapYaw) * cp, Math.sin(this.mapPitch))
        .multiplyScalar(this.mapDistance)
        .add(mapCenter);
      cam.up.set(0, 0, 1);
      cam.lookAt(mapCenter);
      cam.updateMatrixWorld();
      return;
    }
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
