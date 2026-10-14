import { duration, formatDistance, formatSpeed } from '../ui/hud';
import type { Guidance } from './guidance';

/** Above this radar altitude the pad's place along the orbit is shown, for timing the deorbit burn (m). */
const ORBIT_HINT_ALTITUDE = 5_000;

const along = (m: number) => `${formatDistance(Math.abs(m))} ${m >= 0 ? 'long' : 'short'}`;
const across = (m: number) => `${formatDistance(Math.abs(m))} ${m >= 0 ? 'right' : 'left'}`;

/** HUD lines for a spaceport target: they replace the practice target's TARGET and STOP lines. */
export function guidanceLines(g: Guidance, landed: boolean): string[] {
  if (!g.nearMoon) {
    return [`TARGET   ◎ ${g.port.title} on the Moon, ${formatDistance(g.distance)}   (Tab: next)`];
  }
  const bearing =
    g.surfaceDistance > 50 ? `   bearing ${g.bearing.toFixed(0).padStart(3, '0')}°` : '';
  const lines = [
    `TARGET   ◎ ${g.port.title}   ${formatDistance(g.surfaceDistance)}${bearing}   (Tab: next)`,
  ];
  if (landed) return lines;
  if (g.radarAltitude > ORBIT_HINT_ALTITUDE) {
    lines.push(
      `         pad ${String(Math.round(g.angleAhead) % 360)}° ahead in the orbit, ${formatDistance(Math.abs(g.offTrack))} ${g.offTrack >= 0 ? 'left' : 'right'} of the track`,
    );
  }
  lines.push(
    `GROUND   radar ${formatDistance(Math.max(0, g.radarAltitude))}   down ${formatSpeed(g.descentRate)}   across ${formatSpeed(g.groundSpeed)}`,
    g.impact
      ? `IMPACT   ✕ ${along(g.impact.along)}, ${across(g.impact.across)} of the pad, in ${duration(g.impact.time)}`
      : 'IMPACT   none: the orbit clears the ground',
  );
  return lines;
}
