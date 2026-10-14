import { Vector3 } from 'three/webgpu';
import { EARTH, MOON, MOON_SOI, type BodyInfo } from './bodies';
import type { Ephemeris } from './ephemeris';
import {
  gravity,
  integratePoint,
  leoStartState,
  sunlitPhase,
  type AccelerationField,
  type PointState,
} from './orbit';
import type { SimClock } from './time';

/** Distance within which the target counts as "near" for FA and the motion dust (m). */
export const TARGET_NEAR = 5_000;

/**
 * The Earth–Moon system at the clock's time: Moon and Sun from the JPL
 * ephemerides, the co-orbiting target, and which body the ship orbits.
 */
export class World {
  readonly moonPosition = new Vector3();
  readonly moonVelocity = new Vector3();
  readonly sunPosition = new Vector3();
  readonly target: PointState;

  /** Gravity field for the physics step: the Moon is looked up at each substep time. */
  readonly gravityField: AccelerationField;

  private readonly _moon = new Vector3();
  private readonly _omega = new Vector3();
  private readonly _offset = new Vector3();

  constructor(
    readonly clock: SimClock,
    private readonly moon: Ephemeris,
    private readonly sun: Ephemeris,
  ) {
    this.target = { position: new Vector3(), velocity: new Vector3() };
    this.gravityField = (t, p, out) => {
      this.moon.stateAt(this.clock.jdAt(t), this._moon);
      return gravity(p, this._moon, out);
    };
    this.refresh();
  }

  /**
   * Start states for the ship and the practice target: the same 400 km orbit,
   * the ship on the sunlit side so it starts in daylight, the target 2 km ahead.
   */
  startStates(): { ship: PointState; target: PointState } {
    this.refresh();
    const phase = sunlitPhase(this.sunPosition);
    const r = EARTH.radius + 400_000;
    return {
      ship: leoStartState(400_000, 51.6, phase),
      target: leoStartState(400_000, 51.6, phase + 2000 / r),
    };
  }

  /** Updates Moon and Sun positions for the clock's current time. */
  refresh(): void {
    this.moon.stateAt(this.clock.jd, this.moonPosition, this.moonVelocity);
    this.sun.stateAt(this.clock.jd, this.sunPosition);
  }

  /** Moves the target along its orbit for `dt` seconds (call before advancing the clock). */
  stepTarget(dt: number): void {
    integratePoint(this.target, this.gravityField, 0, dt);
  }

  /**
   * Velocity of the target's orbiting frame at `position` (the frame that turns
   * once per orbit, as rendezvous and docking are flown): the target's velocity
   * plus ω × (position − target). A ship on the target's orbit is at rest in it.
   */
  targetFrameVelocity(position: Vector3, out: Vector3): Vector3 {
    const t = this.target;
    this._omega.crossVectors(t.position, t.velocity).divideScalar(t.position.lengthSq());
    this._offset.subVectors(position, t.position);
    return out.crossVectors(this._omega, this._offset).add(t.velocity);
  }

  /** The body the ship is orbiting: the Moon inside its sphere of influence, otherwise Earth. */
  referenceBody(position: Vector3): BodyInfo {
    return position.distanceTo(this.moonPosition) < MOON_SOI ? MOON : EARTH;
  }

  /** Position and velocity of a body in the Earth-centred frame. */
  bodyState(body: BodyInfo): { position: Vector3; velocity: Vector3 } {
    return body === MOON
      ? { position: this.moonPosition, velocity: this.moonVelocity }
      : { position: ZERO, velocity: ZERO };
  }
}

const ZERO = new Vector3();
