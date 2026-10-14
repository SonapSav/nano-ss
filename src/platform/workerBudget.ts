/**
 * Worker count rule from PROJECT.md (Hardware Baseline): parallel work scales
 * with the machine's CPU threads and memory, never a fixed number, and can be
 * overridden for testing and tuning.
 */

export interface WorkerBudgetInput {
  /** Logical CPU threads available. */
  threads: number;
  /** Device memory in GB, if known. */
  memoryGB?: number | undefined;
  /** Memory budget for one worker, in MB. */
  perWorkerMB: number;
  /** Threads left free for the OS and the main/render thread. */
  reserveThreads?: number;
  /** Share of device memory all workers together may use (0 to 1). */
  memoryShare?: number;
  /** Explicit worker count; wins over everything else when set. */
  override?: number | undefined;
}

export const DEFAULT_RESERVE_THREADS = 2;
export const DEFAULT_MEMORY_SHARE = 0.25;

export function computeWorkerCount({
  threads,
  memoryGB,
  perWorkerMB,
  reserveThreads = DEFAULT_RESERVE_THREADS,
  memoryShare = DEFAULT_MEMORY_SHARE,
  override,
}: WorkerBudgetInput): number {
  if (override !== undefined && Number.isFinite(override)) {
    return Math.max(1, Math.floor(override));
  }

  const byThreads = Math.max(1, Math.floor(threads) - reserveThreads);
  if (memoryGB === undefined || !(memoryGB > 0)) {
    return byThreads;
  }

  const byMemory = Math.max(1, Math.floor((memoryGB * 1024 * memoryShare) / perWorkerMB));
  return Math.min(byThreads, byMemory);
}

export interface BrowserWorkerBudget {
  count: number;
  threads: number;
  memoryGB: number | undefined;
  overridden: boolean;
}

/**
 * Reads the browser's hardware hints. Chromium reports `deviceMemory` rounded
 * and capped at 8 GB for privacy, so the memory limit errs on the safe side.
 */
export function browserWorkerBudget(perWorkerMB: number, override?: number): BrowserWorkerBudget {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const threads = nav.hardwareConcurrency || 1;
  const memoryGB = nav.deviceMemory;
  return {
    count: computeWorkerCount({ threads, memoryGB, perWorkerMB, override }),
    threads,
    memoryGB,
    overridden: override !== undefined,
  };
}

/** Worker count override from the page URL, e.g. `?workers=4`. */
export function workerOverrideFromUrl(search: string): number | undefined {
  const value = new URLSearchParams(search).get('workers');
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
