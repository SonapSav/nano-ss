import './style.css';
import { describeGpu, formatGpuReport } from './platform/gpuInfo';
import { browserWorkerBudget, workerOverrideFromUrl } from './platform/workerBudget';
import { createRenderer } from './render/createRenderer';
import { createPlaceholderScene } from './render/placeholderScene';
import { createStatsOverlay } from './ui/statsOverlay';

/** Memory budget per scenery worker until real scenery work defines one. */
const PER_WORKER_MB = 512;

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#view');
  if (!canvas) throw new Error('Canvas #view not found');

  const stats = createStatsOverlay(document.body);
  let lost = false;

  const workers = browserWorkerBudget(PER_WORKER_MB, workerOverrideFromUrl(location.search));
  console.info('[nano-ss] worker budget', workers);

  const { renderer, api } = await createRenderer(canvas, (message) => {
    lost = true;
    console.error(`[nano-ss] ${message}`);
    stats.showError(message);
  });

  const gpu = await describeGpu(api);
  console.info(`[nano-ss] GPU: ${formatGpuReport(gpu)}`);
  stats.setLabel(`${api} | workers ${String(workers.count)}`);

  const world = createPlaceholderScene(window.innerWidth / window.innerHeight);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    world.resize(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  await renderer.setAnimationLoop((now: number) => {
    if (lost) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    world.update(dt);
    renderer.render(world.scene, world.camera);
    stats.frame(now);
  });
}

main().catch((error: unknown) => {
  console.error('[nano-ss] startup failed', error);
  const message = error instanceof Error ? error.message : String(error);
  document.body.insertAdjacentHTML('beforeend', '<div class="stats error"></div>');
  const box = document.querySelector('.stats.error');
  if (box) box.textContent = `Startup failed: ${message}`;
});
