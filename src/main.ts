import './style.css';
import { Quaternion, Vector3 } from 'three/webgpu';
import { DEFAULT_BINDINGS } from './input/bindings';
import { KeyboardInput, applyKeyboard } from './input/keyboard';
import { describeGpu, formatGpuReport } from './platform/gpuInfo';
import { browserWorkerBudget, workerOverrideFromUrl } from './platform/workerBudget';
import { CameraRig } from './render/cameras';
import { createRenderer } from './render/createRenderer';
import { TARGET_POSITION, createSpaceScene } from './render/spaceScene';
import { createControlState, nextAssistMode } from './sim/controls';
import { computeRcs, createFlightComputer, setAssistMode } from './sim/flightComputer';
import { copyBodyState, createBodyState } from './sim/rigidBody';
import { createShip, mainDeltaV, stepShip, type RcsCommand } from './sim/ship';
import { placeholderSpaceplane } from './sim/ships/placeholderSpaceplane';
import { FixedStepLoop } from './sim/simLoop';
import { FrameLimiter } from './ui/frameLimiter';
import { createHud } from './ui/hud';
import { createSettingsPanel, loadSettings } from './ui/settings';
import { createStatsOverlay } from './ui/statsOverlay';

/** Memory budget per scenery worker until real scenery work defines one. */
const PER_WORKER_MB = 512;
const RAD_TO_DEG = 180 / Math.PI;

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await document.documentElement.requestFullscreen();
  // Keyboard lock lets the sim receive Ctrl+W, Ctrl+N, Ctrl+T, which the browser
  // otherwise keeps for itself (Ctrl is throttle down, W/N/T are flight keys).
  const nav = navigator as Navigator & { keyboard?: { lock?: () => Promise<void> } };
  await nav.keyboard?.lock?.();
}

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

  // Simulation.
  const ship = createShip(placeholderSpaceplane);
  const fc = createFlightComputer('off');
  const controls = createControlState();
  const rcs: RcsCommand = { rotation: new Vector3(), translation: new Vector3() };
  const keyboard = new KeyboardInput(window, DEFAULT_BINDINGS);
  const previous = createBodyState();
  copyBodyState(ship.body, previous);

  const loop = new FixedStepLoop((dt) => {
    copyBodyState(ship.body, previous);
    applyKeyboard(keyboard.held, DEFAULT_BINDINGS, controls, dt);
    computeRcs(fc, ship, controls, rcs);
    stepShip(ship, controls.throttle, rcs, dt);
  });

  // Presentation.
  const world = createSpaceScene();
  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  rig.attach(canvas);
  const hud = createHud(document.body);
  const settings = loadSettings();
  const limiter = new FrameLimiter(settings.frameRate);
  const panel = createSettingsPanel(document.body, settings, {
    onChange: (s) => (limiter.mode = s.frameRate),
    onFullscreen: () => void toggleFullscreen(),
  });

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    rig.resize(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  if (import.meta.env.PROD) {
    // A stray Ctrl+W outside fullscreen would otherwise close the tab mid-flight.
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault();
    });
  }

  const setPaused = (paused: boolean) => {
    loop.paused = paused;
    panel.show(paused);
  };

  const renderPosition = new Vector3();
  const renderOrientation = new Quaternion();
  const forward = new Vector3();
  const toTarget = new Vector3();
  let statsVisible = true;
  let last = performance.now();

  await renderer.setAnimationLoop((now: number) => {
    if (lost || !limiter.shouldRender(now)) return;
    const elapsed = (now - last) / 1000;
    last = now;

    for (const action of keyboard.takeActions()) {
      switch (action) {
        case 'throttleFull':
          controls.throttle = 1;
          break;
        case 'throttleCut':
          controls.throttle = 0;
          break;
        case 'cycleAssist':
          setAssistMode(fc, nextAssistMode(fc.mode));
          break;
        case 'switchCamera':
          rig.toggle();
          break;
        case 'pause':
          setPaused(!loop.paused);
          break;
        case 'toggleStats':
          statsVisible = !statsVisible;
          document.querySelector<HTMLElement>('.stats')?.toggleAttribute('hidden', !statsVisible);
          break;
        case 'fullscreen':
          void toggleFullscreen();
          break;
      }
    }

    // Physics on its fixed step, then interpolate between the last two states.
    const alpha = loop.advance(elapsed);
    renderPosition.lerpVectors(previous.position, ship.body.position, alpha);
    renderOrientation.slerpQuaternions(previous.orientation, ship.body.orientation, alpha);

    world.ship.quaternion.copy(renderOrientation);
    rig.update(renderOrientation, loop.paused ? 0 : elapsed);
    world.update(renderPosition, rig.camera.position, ship.appliedThrottle, now / 1000);

    const w = ship.body.angularVelocity;
    const rcsActive =
      ship.appliedRcs.rotation.lengthSq() + ship.appliedRcs.translation.lengthSq() > 1e-6;
    toTarget.subVectors(TARGET_POSITION, ship.body.position);
    const targetDistance = toTarget.length();
    hud.update(
      {
        velocity: ship.body.velocity,
        forward: forward.set(0, 0, -1).applyQuaternion(renderOrientation),
        pitchRate: w.x * RAD_TO_DEG,
        yawRate: -w.y * RAD_TO_DEG,
        rollRate: -w.z * RAD_TO_DEG,
        throttle: controls.throttle,
        mainPropellantFraction: ship.mainPropellant / placeholderSpaceplane.mainPropellantCapacity,
        rcsPropellantFraction: ship.rcsPropellant / placeholderSpaceplane.rcsPropellantCapacity,
        deltaV: mainDeltaV(ship),
        assist: fc.mode,
        camera: rig.mode,
        targetDistance,
        closingSpeed: targetDistance > 0 ? ship.body.velocity.dot(toTarget) / targetDistance : 0,
        rcsActive,
        paused: loop.paused,
      },
      rig.camera,
      now,
    );

    renderer.render(world.scene, rig.camera);
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
