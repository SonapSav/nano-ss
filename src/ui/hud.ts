import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { AssistMode } from '../sim/controls';
import type { CameraMode } from '../render/cameras';
import { edgeMarkerPosition } from './edgeMarker';

export interface HudData {
  /** Ship velocity in the inertial frame (m/s). */
  velocity: Vector3;
  /** The same velocity along the ship's own axes: x right, y up, z forward (m/s). */
  velocityShip: Vector3;
  /** Ship forward direction in world space (unit). */
  forward: Vector3;
  /** Angular rates in pilot terms, deg/s. */
  pitchRate: number;
  yawRate: number;
  rollRate: number;
  throttle: number;
  mainPropellantFraction: number;
  rcsPropellantFraction: number;
  deltaV: number;
  /** Burn time to stop at full throttle with the main and retro engines (s). */
  stopMain: number;
  stopRetro: number;
  fa: boolean;
  reverse: boolean;
  assist: AssistMode;
  camera: CameraMode;
  targetDistance: number;
  closingSpeed: number;
  rcsActive: boolean;
  paused: boolean;
  /** Name of the connected gamepad profile, or null for keyboard only. */
  inputDevice: string | null;
  throttleSource: 'lever' | 'keyboard';
}

const ASSIST_LABEL: Record<AssistMode, string> = {
  off: 'OFF',
  'kill-rotation': 'KILL ROT',
  'hold-attitude': 'HOLD ATT',
  prograde: 'PROGRADE',
  retrograde: 'RETROGRADE',
};

export function formatSpeed(metresPerSecond: number): string {
  const v = Math.abs(metresPerSecond);
  return v >= 1000
    ? `${(metresPerSecond / 1000).toFixed(2)} km/s`
    : `${metresPerSecond.toFixed(1)} m/s`;
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${metres.toFixed(0)} m`;
}

const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const seconds = (s: number) => (Number.isFinite(s) ? `${s.toFixed(0)} s` : '—');
const pct = (fraction: number) => `${(fraction * 100).toFixed(0)}%`;
const rate = (degPerSecond: number) => `${degPerSecond >= 0 ? '+' : ''}${degPerSecond.toFixed(2)}`;

/** DOM overlay: flight data panel plus nose and velocity markers projected on screen. */
export function createHud(parent: HTMLElement) {
  const root = document.createElement('div');
  root.className = 'hud';
  const text = document.createElement('div');
  text.className = 'hud-text';
  const paused = document.createElement('div');
  paused.className = 'hud-paused';
  paused.textContent = 'PAUSED';
  // Each marker has an on-screen symbol and an edge arrow for when it is off screen.
  const marker = (cls: string, symbol: string) => {
    const el = document.createElement('div');
    el.className = `hud-marker ${cls}`;
    el.textContent = symbol;
    const edge = document.createElement('div');
    edge.className = `hud-edge ${cls}`;
    const arrow = document.createElement('span');
    arrow.className = 'hud-edge-arrow';
    arrow.textContent = '➤';
    edge.append(arrow, symbol);
    root.append(el, edge);
    return { el, edge, arrow };
  };
  const nose = marker('nose', '+');
  const prograde = marker('prograde', '⊕');
  const retrograde = marker('retrograde', '⊗');
  root.append(text, paused);
  parent.appendChild(root);

  const projected = new Vector3();
  const toScreen = (el: HTMLElement, x: number, y: number) => {
    el.style.left = `${(((x + 1) / 2) * 100).toFixed(2)}%`;
    el.style.top = `${(((1 - y) / 2) * 100).toFixed(2)}%`;
  };
  const place = (
    m: ReturnType<typeof marker>,
    dir: Vector3,
    camera: PerspectiveCamera,
    show: boolean,
  ) => {
    if (!show) {
      m.el.hidden = true;
      m.edge.hidden = true;
      return;
    }
    // Camera-space direction: z < 0 is in front of the camera.
    projected.copy(dir).transformDirection(camera.matrixWorldInverse);
    const behind = projected.z >= 0;
    let x = projected.x;
    let y = projected.y;
    if (!behind) {
      projected.copy(dir).multiplyScalar(1e3).add(camera.position).project(camera);
      x = projected.x;
      y = projected.y;
    }
    const onScreen = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1;
    m.el.hidden = !onScreen;
    m.edge.hidden = onScreen;
    if (onScreen) {
      toScreen(m.el, x, y);
      return;
    }
    const edge = edgeMarkerPosition(x, y);
    toScreen(m.edge, edge.x, edge.y);
    // Screen y points down, so CSS rotation is the negative of the math angle.
    m.arrow.style.transform = `rotate(${(-edge.angle).toFixed(3)}rad)`;
  };

  let lastText = 0;
  const velocityDir = new Vector3();
  const retroDir = new Vector3();

  return {
    update(data: HudData, camera: PerspectiveCamera, nowMs: number) {
      const speed = data.velocity.length();
      const moving = speed > 0.05;
      velocityDir.copy(data.velocity).normalize();
      retroDir.copy(velocityDir).negate();
      place(nose, data.forward, camera, data.camera === 'chase');
      place(prograde, velocityDir, camera, moving);
      place(retrograde, retroDir, camera, moving);
      paused.hidden = !data.paused;

      // Text changes are throttled to 10 per second; markers move every frame.
      if (nowMs - lastText < 100) return;
      lastText = nowMs;
      text.textContent = [
        `SPEED    ${formatSpeed(speed)}`,
        `VEL      fwd ${signed(data.velocityShip.z)}  right ${signed(data.velocityShip.x)}  up ${signed(data.velocityShip.y)} m/s`,
        `TARGET   ${formatDistance(data.targetDistance)}  closing ${formatSpeed(data.closingSpeed)}`,
        `RATES    P ${rate(data.pitchRate)}  Y ${rate(data.yawRate)}  R ${rate(data.rollRate)} °/s`,
        `THROTTLE ${pct(data.throttle)}${data.inputDevice && data.throttleSource === 'lever' ? '  (lever)' : ''}`,
        `MAIN     ${pct(data.mainPropellantFraction)}  Δv ${formatSpeed(data.deltaV)}`,
        moving
          ? `STOP     main ${seconds(data.stopMain)} | retro ${seconds(data.stopRetro)}  need Δv ${formatSpeed(speed)}${speed > data.deltaV ? '  NOT ENOUGH Δv' : ''}`
          : 'STOP     at rest',
        `RCS      ${pct(data.rcsPropellantFraction)}${data.rcsActive ? '  firing' : ''}`,
        `ASSIST   ${ASSIST_LABEL[data.assist]}   FA ${data.fa ? 'ON' : 'OFF'}${data.reverse ? '   REVERSE' : ''}`,
        `CAMERA   ${data.camera.toUpperCase()}`,
        `INPUT    ${data.inputDevice ? `keyboard + ${data.inputDevice}` : 'keyboard (press a HOTAS button to connect it)'}`,
      ].join('\n');
    },
  };
}
