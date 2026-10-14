import './style.css';
import { Quaternion, Vector3 } from 'three/webgpu';
import { addGamepad, createThrottleArbiter } from './input/combine';
import { GamepadInput, type GamepadFrame } from './input/gamepad/gamepadInput';
import { KeyboardInput, applyKeyboard } from './input/keyboard';
import { calibrationFor, loadInputSettings } from './input/storage';
import { describeGpu, formatGpuReport } from './platform/gpuInfo';
import { browserWorkerBudget, workerOverrideFromUrl } from './platform/workerBudget';
import { CameraRig } from './render/cameras';
import { createRenderer } from './render/createRenderer';
import { TARGET_POSITION, createSpaceScene } from './render/spaceScene';
import { createControlState, nextAssistMode } from './sim/controls';
import {
  computeCommands,
  createFlightCommands,
  createFlightComputer,
  setAssistMode,
} from './sim/flightComputer';
import { copyBodyState, createBodyState } from './sim/rigidBody';
import { createShip, engineAcceleration, mainDeltaV, resetShip, stepShip } from './sim/ship';
import { placeholderSpacecraft } from './sim/ships/placeholderSpacecraft';
import { FixedStepLoop } from './sim/simLoop';
import { FrameLimiter } from './ui/frameLimiter';
import { createControlsPanel } from './ui/controlsPanel';
import { createGamepadDebug, gamepadDebugEnabled } from './ui/gamepadDebug';
import { createHud } from './ui/hud';
import { createSettingsPanel, loadSettings, saveSettings } from './ui/settings';
import { createStatsOverlay } from './ui/statsOverlay';

/** Memory budget per scenery worker until real scenery work defines one. */
const PER_WORKER_MB = 512;
const RAD_TO_DEG = 180 / Math.PI;
/** Body axes have -Z forward; the HUD shows forward as positive. */
const FLIP_Z = new Vector3(1, 1, -1);

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
  const ship = createShip(placeholderSpacecraft);
  const settings = loadSettings();
  const fc = createFlightComputer('off', settings.fa);
  const controls = createControlState();
  const commands = createFlightCommands();
  const inputSettings = loadInputSettings();
  const keyboard = new KeyboardInput(window, inputSettings.keyboard);
  const gamepad = new GamepadInput(inputSettings.profiles, (p) => calibrationFor(inputSettings, p));
  const arbiter = createThrottleArbiter();
  // Polled once per rendered frame; the physics steps use the latest reading.
  let pad: GamepadFrame = { device: null, axes: {} };
  const previous = createBodyState();
  copyBodyState(ship.body, previous);

  const loop = new FixedStepLoop((dt) => {
    copyBodyState(ship.body, previous);
    applyKeyboard(keyboard.held, keyboard.bindings, controls, dt);
    addGamepad(controls, pad, arbiter);
    computeCommands(fc, ship, controls, commands);
    stepShip(ship, commands.engines, commands.rcs, dt);
  });

  // Presentation.
  const world = createSpaceScene();
  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  rig.attach(canvas);
  const hud = createHud(document.body);
  const gamepadDebug = gamepadDebugEnabled(location.search)
    ? createGamepadDebug(document.body)
    : null;
  const limiter = new FrameLimiter(settings.frameRate);
  const controlsPanel = createControlsPanel(inputSettings, (s) => {
    keyboard.setBindings(s.keyboard);
    gamepad.profiles = s.profiles;
  });
  const panel = createSettingsPanel(
    document.body,
    settings,
    {
      onChange: (s) => (limiter.mode = s.frameRate),
      onFullscreen: () => void toggleFullscreen(),
    },
    controlsPanel.element,
  );

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
    if (!paused) controlsPanel.cancel();
  };

  const renderPosition = new Vector3();
  const renderOrientation = new Quaternion();
  const forward = new Vector3();
  const toTarget = new Vector3();
  const targetDirection = new Vector3();
  const velocityShip = new Vector3();
  const inverseOrientation = new Quaternion();
  let statsVisible = true;
  let last = performance.now();

  await renderer.setAnimationLoop((now: number) => {
    if (lost || !limiter.shouldRender(now)) return;
    const elapsed = (now - last) / 1000;
    last = now;

    pad = gamepad.poll();
    if (loop.paused) controlsPanel.update();

    for (const action of [...keyboard.takeActions(), ...gamepad.takeActions()]) {
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
        case 'assistKill':
          setAssistMode(fc, 'kill-rotation');
          break;
        case 'assistHold':
          setAssistMode(fc, 'hold-attitude');
          break;
        case 'assistOff':
          setAssistMode(fc, 'off');
          break;
        case 'assistPrograde':
          setAssistMode(fc, 'prograde');
          break;
        case 'assistRetrograde':
          setAssistMode(fc, 'retrograde');
          break;
        case 'toggleFlightAssist':
          fc.fa = !fc.fa;
          settings.fa = fc.fa;
          saveSettings(settings);
          break;
        case 'toggleReverse':
          // Switching direction cuts thrust; the lever must move to drive the throttle again.
          controls.reverse = !controls.reverse;
          controls.throttle = 0;
          arbiter.leverActive = false;
          arbiter.lastApplied = null;
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
        case 'resetShip':
          resetShip(ship);
          copyBodyState(ship.body, previous);
          setAssistMode(fc, fc.mode);
          controls.throttle = 0;
          controls.reverse = false;
          // The lever must move before it drives the throttle again.
          arbiter.leverActive = false;
          arbiter.lastApplied = null;
          break;
      }
    }

    // Physics on its fixed step, then interpolate between the last two states.
    const alpha = loop.advance(elapsed);
    renderPosition.lerpVectors(previous.position, ship.body.position, alpha);
    renderOrientation.slerpQuaternions(previous.orientation, ship.body.orientation, alpha);

    world.ship.quaternion.copy(renderOrientation);
    rig.update(renderOrientation, loop.paused ? 0 : elapsed);
    world.update(
      renderPosition,
      rig.camera.position,
      ship.appliedThrottle,
      ship.appliedRetro,
      ship.appliedRcs,
      settings.dust,
      now / 1000,
    );

    const w = ship.body.angularVelocity;
    const rcsActive =
      ship.appliedRcs.rotation.lengthSq() + ship.appliedRcs.translation.lengthSq() > 1e-6;
    toTarget.subVectors(TARGET_POSITION, ship.body.position);
    const targetDistance = toTarget.length();
    hud.update(
      {
        velocity: ship.body.velocity,
        velocityShip: velocityShip
          .copy(ship.body.velocity)
          .applyQuaternion(inverseOrientation.copy(ship.body.orientation).invert())
          .multiply(FLIP_Z),
        forward: forward.set(0, 0, -1).applyQuaternion(renderOrientation),
        pitchRate: w.x * RAD_TO_DEG,
        yawRate: -w.y * RAD_TO_DEG,
        rollRate: -w.z * RAD_TO_DEG,
        throttle: controls.throttle,
        mainPropellantFraction: ship.mainPropellant / placeholderSpacecraft.mainPropellantCapacity,
        rcsPropellantFraction: ship.rcsPropellant / placeholderSpacecraft.rcsPropellantCapacity,
        deltaV: mainDeltaV(ship),
        stopMain: ship.body.velocity.length() / engineAcceleration(ship, 'main'),
        stopRetro: ship.body.velocity.length() / engineAcceleration(ship, 'retro'),
        fa: fc.fa,
        reverse: controls.reverse,
        assist: fc.mode,
        camera: rig.mode,
        targetDistance,
        targetDirection: targetDirection.copy(toTarget).normalize(),
        closingSpeed: targetDistance > 0 ? ship.body.velocity.dot(toTarget) / targetDistance : 0,
        rcsActive,
        paused: loop.paused,
        inputDevice: pad.device,
        throttleSource: arbiter.leverActive ? 'lever' : 'keyboard',
      },
      rig.camera,
      now,
    );

    gamepadDebug?.update(now);
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
