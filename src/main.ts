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
import { apsides } from './render/orbitLine';
import { createSpaceScene } from './render/spaceScene';
import { loadStarfield } from './render/starfield';
import { loadTextures } from './render/textures';
import { loadSpaceports } from './world/sites';
import { EARTH, MOON, MOON_SOI } from './world/bodies';
import { createControlState, nextAssistMode } from './sim/controls';
import { commandStop, createFlightComputer, setAssistMode } from './sim/flightComputer';
import { copyBodyState, createBodyState } from './sim/rigidBody';
import { createShip, engineAcceleration, mainDeltaV, resetShip } from './sim/ship';
import { placeholderSpacecraft } from './sim/ships/placeholderSpacecraft';
import { FixedStepLoop } from './sim/simLoop';
import { FrameLimiter } from './ui/frameLimiter';
import { createControlsPanel } from './ui/controlsPanel';
import { createGamepadDebug, gamepadDebugEnabled } from './ui/gamepadDebug';
import { createHud } from './ui/hud';
import { createSettingsPanel, loadSettings, saveSettings } from './ui/settings';
import { createStatsOverlay } from './ui/statsOverlay';
import { Ephemeris } from './world/ephemeris';
import { orbitElements, orientationFromForwardUp } from './world/orbit';
import { WARP_DROP_MESSAGES } from './world/timeWarp';
import { createPhysicsState, stepPhysics, type HyperEvent } from './game/physicsStep';
import { C } from './world/hyperdrive';
import { HYPER_MESSAGES, hyperHud } from './game/hyperHud';
import { landingLine, landingMessage } from './game/landingHud';
import { computeGuidance, type Guidance } from './game/guidance';
import { guidanceLines } from './game/guidanceHud';
import { SimClock, gmstRadians } from './world/time';
import { TARGET_NEAR, World } from './world/world';

/** Memory budget per scenery worker until real scenery work defines one. */
const PER_WORKER_MB = 512;
const RAD_TO_DEG = 180 / Math.PI;
/** Sun shadows are drawn below this height over the lunar ground (m): they only matter near the surface. */
const SHADOW_ALTITUDE = 50_000;
/** Below this height over the lunar ground the orbit line shows only in the map view (m). */
const ORBIT_LINE_ALTITUDE = 30_000;
/** Landing lights sit this far below the centre of mass, tail down (m). */
const LIGHTS_BELOW_CENTRE = 3.6;
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

  // World: real Moon and Sun positions from the JPL tables, clock at the real current time.
  const [moonTable, sunTable] = await Promise.all([
    Ephemeris.load('data/moon.ephem'),
    Ephemeris.load('data/sun.ephem'),
  ]);
  const clock = SimClock.now();
  const world = new World(clock, moonTable, sunTable);

  // Simulation.
  const ship = createShip(placeholderSpacecraft);
  const settings = loadSettings();
  const fc = createFlightComputer('off', settings.fa);
  const controls = createControlState();
  const inputSettings = loadInputSettings();
  const keyboard = new KeyboardInput(window, inputSettings.keyboard);
  const gamepad = new GamepadInput(inputSettings.profiles, (p) => calibrationFor(inputSettings, p));
  const arbiter = createThrottleArbiter();
  // Polled once per rendered frame; the physics steps use the latest reading.
  let pad: GamepadFrame = { device: null, axes: {} };
  const previous = createBodyState();
  const previousTarget = new Vector3();
  const orbitalVelocity = new Vector3();
  let alert: string | null = null;

  /** Ship and target back to the start: 400 km circular orbit in daylight, nose prograde, roof away from Earth. */
  const placeAtStart = () => {
    resetShip(ship);
    const { ship: start, target } = world.startStates();
    ship.body.position.copy(start.position);
    ship.body.velocity.copy(start.velocity);
    orientationFromForwardUp(start.velocity, start.position, ship.body.orientation);
    world.target.position.copy(target.position);
    world.target.velocity.copy(target.velocity);
    copyBodyState(ship.body, previous);
    previousTarget.copy(world.target.position);
  };
  placeAtStart();

  const physics = createPhysicsState(ship, world, fc, controls);
  let notice: { text: string; until: number } | null = null;
  const hyperEvents: HyperEvent[] = [];

  const loop = new FixedStepLoop((dt) => {
    copyBodyState(ship.body, previous);
    previousTarget.copy(world.target.position);
    applyKeyboard(keyboard.held, keyboard.bindings, controls, dt);
    addGamepad(controls, pad, arbiter);

    const events = stepPhysics(physics, dt);
    if (events.hyper) hyperEvents.push(events.hyper);
    if (events.warpDrop) {
      notice = { text: WARP_DROP_MESSAGES[events.warpDrop], until: performance.now() + 4000 };
    }
    if (events.landing) {
      notice = {
        text: landingMessage(events.landing, physics.landing),
        until: performance.now() + 5000,
      };
    }
    if (events.hazard) {
      const h = events.hazard;
      alert =
        h.kind === 'burned-up'
          ? "BURNED UP in Earth's atmosphere. Press R to reset."
          : h.detail
            ? `CRASHED: ${h.detail}. Press R to reset.`
            : 'CRASHED into the Moon. Press R to reset.';
      physics.warp.limit(1);
      loop.paused = true;
    }
  });

  // Presentation.
  // Scenery: NASA textures, the real star catalogue, and the Moon's path for the coming month.
  const [textures, stars, spaceports] = await Promise.all([
    loadTextures(renderer),
    loadStarfield('data/stars.bin'),
    loadSpaceports(),
  ]);
  world.spaceports = spaceports;

  // Test start (?start=tranquility or ?start=shackleton, optional &alt=metres, default 2 km):
  // over the pad, tail down, matching the ground.
  const params = new URLSearchParams(location.search);
  const testStart = params.get('start');
  const testAltitude = Number(params.get('alt') ?? 2000) || 2000;
  const startPort = spaceports.find((p) => p.name === testStart);
  if (startPort) {
    const up = startPort.site.padPoint(new Vector3()).normalize();
    const local = startPort.site.padPoint(new Vector3()).addScaledVector(up, testAltitude);
    world.moonFrame.toWorld(local, ship.body.position);
    world.moonFrame.groundVelocity(ship.body.position, ship.body.velocity);
    const upWorld = up.clone().applyQuaternion(world.moonFrame.orientation);
    const northWorld = startPort.site.north.clone().applyQuaternion(world.moonFrame.orientation);
    orientationFromForwardUp(upWorld, northWorld, ship.body.orientation);
    copyBodyState(ship.body, previous);
    physics.reference = world.referenceBody(ship.body.position);
    physics.insideTargetZone = false;
    physics.navTarget = startPort;
  }
  const moonOrbit = new Float32Array(361 * 3);
  const moonPoint = new Vector3();
  for (let i = 0; i <= 360; i++) {
    moonTable.stateAt(clock.jd + (i / 360) * 27.32, moonPoint);
    moonOrbit.set([moonPoint.x, moonPoint.y, moonPoint.z], i * 3);
  }
  const scene = createSpaceScene({ textures, stars, moonOrbit, spaceports });
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
  const referenceRender = new Vector3();
  const renderTarget = new Vector3();
  const relativePosition = new Vector3();
  const relativeVelocity = new Vector3();
  const frameVelocity = new Vector3();
  const toMoon = new Vector3();
  const targetDirection = new Vector3();
  const velocityShip = new Vector3();
  const inverseOrientation = new Quaternion();
  let statsVisible = true;
  let landingLights = false;
  /** Spaceport guidance, recomputed 10 times a second (the impact prediction is not free). */
  let guidance: Guidance | null = null;
  let guidanceAt = 0;
  const padRender = new Vector3();
  const impactRender = new Vector3();
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
          // Throttle cut doubles as "stop": near a target FA brings the ship to rest (D-045).
          controls.throttle = 0;
          commandStop(fc);
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
        case 'toggleMap':
          rig.toggleMap();
          break;
        case 'toggleLandingLights':
          landingLights = !landingLights;
          break;
        case 'cycleTarget': {
          // Practice target, then each spaceport, then back.
          const targets = [null, ...spaceports];
          const next = targets[(targets.indexOf(physics.navTarget) + 1) % targets.length] ?? null;
          physics.navTarget = next;
          guidance = null;
          notice = {
            text: `Target: ${next ? next.title : 'practice target (Earth orbit)'}`,
            until: now + 3000,
          };
          break;
        }
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
        case 'warpUp':
          if (physics.hyper.state !== 'active') physics.warp.up();
          break;
        case 'hyperEngage':
          physics.hyper.requestEngage();
          break;
        case 'hyperDrop':
          physics.hyper.requestDrop();
          break;
        case 'warpDown':
          physics.warp.down();
          break;
        case 'resetShip':
          placeAtStart();
          physics.landing.reset();
          physics.hyper.finishDrop();
          physics.warp.limit(1);
          physics.reference = world.referenceBody(ship.body.position);
          physics.insideTargetZone = true;
          fc.cruise = null;
          alert = null;
          setPaused(false);
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
    for (const event of hyperEvents.splice(0)) {
      const message = HYPER_MESSAGES[event];
      if (message) notice = { text: message(world, ship.body.position), until: now + 5000 };
      if (event === 'engaged' || event === 'arrived' || event === 'dropped') hud.flash();
    }
    renderPosition.lerpVectors(previous.position, ship.body.position, alpha);
    renderOrientation.slerpQuaternions(previous.orientation, ship.body.orientation, alpha);
    // The target moves at orbital speed too: interpolate it, or it would jitter by tens of metres.
    renderTarget.lerpVectors(previousTarget, world.target.position, alpha);

    // Orbit around the body being orbited: for the orbit line, the map view, and the HUD.
    const referenceBody = world.referenceBody(ship.body.position);
    const reference = world.bodyState(referenceBody);
    relativePosition.subVectors(ship.body.position, reference.position);
    orbitalVelocity.subVectors(ship.body.velocity, reference.velocity);
    const elements = orbitElements(relativePosition, orbitalVelocity, referenceBody.gm);
    referenceRender.subVectors(reference.position, renderPosition);
    const { periapsis, apoapsis } = apsides(elements);
    periapsis.add(referenceRender);
    apoapsis?.add(referenceRender);

    const moonAltitude = world.moonGroundAltitude(renderPosition);
    scene.ship.quaternion.copy(renderOrientation);
    rig.update(renderOrientation, loop.paused ? 0 : elapsed, referenceRender, referenceBody.radius);
    const nearTarget = renderPosition.distanceTo(renderTarget) < TARGET_NEAR;
    scene.update({
      ship: renderPosition,
      cameraPosition: rig.camera.position,
      moon: world.moonPosition,
      moonVelocity: world.moonVelocity,
      moonOrientation: world.moonFrame.orientation,
      shadows: settings.shadows && moonAltitude < SHADOW_ALTITUDE,
      mapView: rig.mode === 'map',
      landingLights: landingLights ? moonAltitude - LIGHTS_BELOW_CENTRE : null,
      sun: world.sunPosition,
      target: renderTarget,
      earthRotation: gmstRadians(clock.jd),
      throttle: ship.appliedThrottle,
      retro: ship.appliedRetro,
      rcs: ship.appliedRcs,
      showDust: settings.dust && nearTarget,
      timeSeconds: now / 1000,
      hyperSpeed: physics.hyper.state === 'active' ? physics.hyper.speed / C : null,
      dt: elapsed,
      // Near the lunar ground the orbit line is clutter: only in the map there.
      orbit:
        rig.mode === 'map' || moonAltitude > ORBIT_LINE_ALTITUDE
          ? {
              elements,
              center: reference.position,
              maxRadius: referenceBody === EARTH ? 1.5e9 : MOON_SOI,
            }
          : null,
    });

    const w = ship.body.angularVelocity;
    const rcsActive =
      ship.appliedRcs.rotation.lengthSq() + ship.appliedRcs.translation.lengthSq() > 1e-6;
    toTarget.subVectors(world.target.position, ship.body.position);
    const targetDistance = toTarget.length();
    // Relative to the target's orbiting frame, so a ship on the same orbit reads as at rest.
    relativeVelocity.subVectors(
      ship.body.velocity,
      world.targetFrameVelocity(ship.body.position, frameVelocity),
    );
    const port = physics.navTarget;
    if (!port) guidance = null;
    else if (!guidance || now - guidanceAt > 100) {
      guidance = computeGuidance(world, port, ship.body.position, ship.body.velocity);
      guidanceAt = now;
    }
    // With a spaceport targeted, VEL is over the ground (near the Moon).
    const overGround = port !== null && referenceBody === MOON;
    const shipVelocity = overGround
      ? velocityShip.subVectors(
          ship.body.velocity,
          world.moonFrame.groundVelocity(ship.body.position, frameVelocity),
        )
      : velocityShip.copy(relativeVelocity);
    const targetSpeed = relativeVelocity.length();
    toMoon.subVectors(world.moonPosition, ship.body.position);
    hud.update(
      {
        velocity: orbitalVelocity,
        velocityShip: shipVelocity
          .applyQuaternion(inverseOrientation.copy(ship.body.orientation).invert())
          .multiply(FLIP_Z),
        targetSpeed,
        orbit: {
          body: referenceBody.name,
          altitude: relativePosition.length() - referenceBody.radius,
          apoapsisAltitude: elements.apoapsisRadius - referenceBody.radius,
          periapsisAltitude: elements.periapsisRadius - referenceBody.radius,
          period: elements.period,
          inclination: elements.inclination,
          timeToApoapsis: elements.timeToApoapsis,
          timeToPeriapsis: elements.timeToPeriapsis,
        },
        moonDistance: toMoon.length(),
        moonDirection: toMoon.normalize(),
        simDate: clock.date,
        periapsis,
        apoapsis,
        hyper: hyperHud(
          physics,
          world,
          ship.body.position,
          ship.body.orientation,
          controls.throttle,
        ),
        landing: landingLine(physics.landing),
        velocityFrame: overGround ? 'ground' : 'target',
        guidance:
          port && guidance
            ? {
                lines: guidanceLines(guidance, physics.landing.phase === 'landed'),
                pad: world.moonFrame
                  .toWorld(port.site.padPoint(padRender), padRender)
                  .sub(renderPosition),
                impact: guidance.impact
                  ? world.moonFrame.toWorld(guidance.impact.local, impactRender).sub(renderPosition)
                  : null,
              }
            : null,
        warp: physics.warp.factor,
        notice: notice && performance.now() < notice.until ? notice.text : null,
        alert,
        forward: forward.set(0, 0, -1).applyQuaternion(renderOrientation),
        pitchRate: w.x * RAD_TO_DEG,
        yawRate: -w.y * RAD_TO_DEG,
        rollRate: -w.z * RAD_TO_DEG,
        throttle: controls.throttle,
        mainPropellantFraction: ship.mainPropellant / placeholderSpacecraft.mainPropellantCapacity,
        rcsPropellantFraction: ship.rcsPropellant / placeholderSpacecraft.rcsPropellantCapacity,
        deltaV: mainDeltaV(ship),
        stopMain: targetSpeed / engineAcceleration(ship, 'main'),
        stopRetro: targetSpeed / engineAcceleration(ship, 'retro'),
        fa: fc.fa,
        cruise: fc.cruise,
        reverse: controls.reverse,
        assist: fc.mode,
        camera: rig.mode,
        targetDistance,
        targetDirection: targetDirection.copy(toTarget).normalize(),
        closingSpeed: targetDistance > 0 ? -relativeVelocity.dot(toTarget) / targetDistance : 0,
        rcsActive,
        paused: loop.paused,
        inputDevice: pad.device,
        throttleSource: arbiter.leverActive ? 'lever' : 'keyboard',
      },
      rig.camera,
      now,
    );

    gamepadDebug?.update(now);
    renderer.render(scene.scene, rig.camera);
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
