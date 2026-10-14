/** Physics rate (Stage 1 decision): 120 steps per second, a multiple of 60. */
export const PHYSICS_HZ = 120;

/**
 * Fixed time step with an accumulator, so the simulation is the same at any
 * frame rate (D-035). Returns the interpolation factor between the previous
 * and current physics state for rendering.
 */
export class FixedStepLoop {
  readonly dt: number;
  private accumulator = 0;
  private readonly maxFrameTime: number;
  paused = false;
  steps = 0;

  constructor(
    private readonly step: (dt: number) => void,
    hz = PHYSICS_HZ,
    /** Longest frame gap that is simulated, in s; protects against a catch-up spiral after a stall. */
    maxFrameTime = 0.25,
  ) {
    this.dt = 1 / hz;
    this.maxFrameTime = maxFrameTime;
  }

  /** Advances by real elapsed time (s); returns alpha in [0, 1). */
  advance(elapsed: number): number {
    if (this.paused) return this.accumulator / this.dt;
    this.accumulator += Math.min(Math.max(elapsed, 0), this.maxFrameTime);
    while (this.accumulator >= this.dt) {
      this.step(this.dt);
      this.accumulator -= this.dt;
      this.steps += 1;
    }
    return this.accumulator / this.dt;
  }
}
