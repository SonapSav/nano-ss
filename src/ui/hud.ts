import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { AssistMode } from '../sim/controls';
import type { CameraMode } from '../render/cameras';
import { edgeMarkerPosition } from './edgeMarker';

/** Orbit around the reference body, for the HUD. */
export interface HudOrbit {
  body: string;
  altitude: number;
  apoapsisAltitude: number;
  periapsisAltitude: number;
  period: number;
  inclination: number;
  timeToApoapsis: number;
  timeToPeriapsis: number;
}

export interface HudData {
  /** Velocity relative to the body being orbited (m/s): ⊕ and ⊗ follow it. */
  velocity: Vector3;
  /** Velocity relative to the target along the ship's own axes: x right, y up, z forward (m/s). */
  velocityShip: Vector3;
  /** Speed relative to the target (m/s): what the STOP hint is about. */
  targetSpeed: number;
  orbit: HudOrbit;
  /** Unit direction to the Moon, and its distance (m). */
  moonDirection: Vector3;
  moonDistance: number;
  simDate: Date;
  /** Time warp factor, and a short notice (e.g. why warp stopped), or null. */
  warp: number;
  notice: string | null;
  /** Hazard or other message shown in the middle of the screen, or null. */
  alert: string | null;
  /** Periapsis and apoapsis in render space (ship at the origin), or null. */
  periapsis: Vector3 | null;
  apoapsis: Vector3 | null;
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
  /** Cruise speed FA holds near a target (m/s), or null (D-045). */
  cruise: number | null;
  reverse: boolean;
  assist: AssistMode;
  camera: CameraMode;
  targetDistance: number;
  /** Unit direction from the ship to the target, world space. */
  targetDirection: Vector3;
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
const ORIGIN = new Vector3();
const km = (m: number) => (Number.isFinite(m) ? `${(m / 1000).toFixed(1)} km` : 'escape');
/** Compact duration: 45 s, 12m 30s, 3h 05m, 2d 04h; dash when undefined. */
export function duration(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const t = Math.round(s);
  if (t < 60) return `${String(t)} s`;
  if (t < 3600) return `${String(Math.floor(t / 60))}m ${String(t % 60).padStart(2, '0')}s`;
  if (t < 86_400)
    return `${String(Math.floor(t / 3600))}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;
  return `${String(Math.floor(t / 86_400))}d ${String(Math.floor((t % 86_400) / 3600)).padStart(2, '0')}h`;
}
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
  const target = marker('target', '◇');
  const moonMarker = marker('moon', '☾');
  const peMarker = marker('apsis', 'Pe');
  const apMarker = marker('apsis', 'Ap');
  const shipMarker = marker('ship', '▲');
  const pointDir = new Vector3();
  /** Direction from the camera to a render-space point. */
  const toward = (p: Vector3, camera: PerspectiveCamera) =>
    pointDir.subVectors(p, camera.position).normalize();
  const label = (m: ReturnType<typeof marker>, text: string) => {
    m.el.textContent = text;
    m.edge.lastChild?.replaceWith(text);
  };
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
      place(target, data.targetDirection, camera, data.targetDistance > 1);
      place(moonMarker, data.moonDirection, camera, true);
      place(shipMarker, toward(ORIGIN, camera), camera, data.camera === 'map');
      if (data.periapsis) place(peMarker, toward(data.periapsis, camera), camera, true);
      else place(peMarker, ORIGIN, camera, false);
      if (data.apoapsis) place(apMarker, toward(data.apoapsis, camera), camera, true);
      else place(apMarker, ORIGIN, camera, false);
      paused.hidden = !data.paused && data.alert === null;
      paused.textContent = data.alert ?? 'PAUSED';

      // Text changes are throttled to 10 per second; markers move every frame.
      if (nowMs - lastText < 100) return;
      lastText = nowMs;
      const o = data.orbit;
      label(peMarker, `Pe ${km(o.periapsisAltitude)}`);
      label(apMarker, `Ap ${km(o.apoapsisAltitude)}`);
      const ts = data.targetSpeed;
      text.textContent = [
        `TIME     ${data.simDate.toISOString().slice(0, 19).replace('T', ' ')} UTC${data.warp > 1 ? `   WARP ${String(data.warp)}×${data.warp > 4 ? ' (coasting)' : ''}` : ''}`,
        ...(data.notice ? [`         ${data.notice}`] : []),
        `ORBIT    ${o.body}  ALT ${km(o.altitude)}  SPEED ${formatSpeed(speed)}`,
        `         Ap ${km(o.apoapsisAltitude)} in ${duration(o.timeToApoapsis)} | Pe ${km(o.periapsisAltitude)} in ${duration(o.timeToPeriapsis)}`,
        `         period ${duration(o.period)}  inc ${((o.inclination * 180) / Math.PI).toFixed(1)}°  Moon ${formatDistance(data.moonDistance)}`,
        `TARGET   ${formatDistance(data.targetDistance)}  closing ${formatSpeed(data.closingSpeed)}`,
        `VEL      fwd ${signed(data.velocityShip.z)}  right ${signed(data.velocityShip.x)}  up ${signed(data.velocityShip.y)} m/s (to target)`,
        `RATES    P ${rate(data.pitchRate)}  Y ${rate(data.yawRate)}  R ${rate(data.rollRate)} °/s`,
        `THROTTLE ${pct(data.throttle)}${data.inputDevice && data.throttleSource === 'lever' ? '  (lever)' : ''}`,
        `MAIN     ${pct(data.mainPropellantFraction)}  Δv ${formatSpeed(data.deltaV)}`,
        ts > 0.05
          ? `STOP     to target: main ${seconds(data.stopMain)} | retro ${seconds(data.stopRetro)}  need Δv ${formatSpeed(ts)}${ts > data.deltaV ? '  NOT ENOUGH Δv' : ''}`
          : 'STOP     matched with target',
        `RCS      ${pct(data.rcsPropellantFraction)}${data.rcsActive ? '  firing' : ''}`,
        `ASSIST   ${ASSIST_LABEL[data.assist]}   FA ${data.fa ? 'ON' : 'OFF'}${data.cruise ? `   CRUISE ${signed(data.cruise)} m/s` : ''}${data.reverse ? '   REVERSE' : ''}`,
        `CAMERA   ${data.camera.toUpperCase()}`,
        `INPUT    ${data.inputDevice ? `keyboard + ${data.inputDevice}` : 'keyboard (press a HOTAS button to connect it)'}`,
      ].join('\n');
    },
  };
}
