/** Frame rate setting (D-035): 60 fps by default, or the display's refresh rate. */
export type FrameRateMode = 'cap-60' | 'display';

/**
 * Decides on each display refresh whether to render. In cap-60 mode it keeps
 * a fixed schedule, so the long-run rate is 60 fps even on a 144 Hz display;
 * there, frames land 2 or 3 refreshes apart, which is expected.
 */
export class FrameLimiter {
  private next = -Infinity;

  constructor(
    public mode: FrameRateMode,
    private readonly targetHz = 60,
    /** Accept a refresh this early, to absorb vsync timing jitter (ms). */
    private readonly toleranceMs = 2,
  ) {}

  shouldRender(nowMs: number): boolean {
    if (this.mode === 'display') return true;
    if (nowMs < this.next - this.toleranceMs) return false;
    const interval = 1000 / this.targetHz;
    // After a stall (or on the first frame) restart the schedule instead of catching up.
    this.next = nowMs - this.next > interval ? nowMs + interval : this.next + interval;
    return true;
  }
}
