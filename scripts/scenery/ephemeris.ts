/**
 * Downloads geocentric Moon and Sun state vectors from NASA JPL Horizons and
 * writes them as compact binary tables to public/data/, for the in-game
 * ephemeris (src/world/ephemeris.ts). Run with `make scenery`.
 *
 * Frame: ICRF (J2000 equatorial), Earth-centred, geometric states, UT times.
 * File layout (little-endian Float64): version, startJD, stepDays, count,
 * then count × [x, y, z, vx, vy, vz] in km and km/s.
 */
import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const START = '2020-01-01';
const STOP = '2040-01-01';

const BODIES = [
  { name: 'moon', command: '301', step: '12 h', stepDays: 0.5 },
  { name: 'sun', command: '10', step: '1 d', stepDays: 1 },
] as const;

async function fetchTable(command: string, step: string): Promise<number[][]> {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'",
    START_TIME: `'${START}'`,
    STOP_TIME: `'${STOP}'`,
    STEP_SIZE: `'${step}'`,
    TIME_TYPE: "'UT'",
    VEC_TABLE: "'2'",
    REF_PLANE: "'FRAME'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
  });
  const response = await fetch(`${API}?${params.toString()}`);
  if (!response.ok) throw new Error(`Horizons HTTP ${String(response.status)}`);
  const { result } = (await response.json()) as { result: string };
  const start = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE');
  if (start < 0 || end < 0) throw new Error(`Unexpected Horizons reply:\n${result.slice(-500)}`);
  return result
    .slice(start + 5, end)
    .trim()
    .split('\n')
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      return [cols[0], ...cols.slice(2, 8)].map(Number);
    });
}

await mkdir('public/data', { recursive: true });
for (const body of BODIES) {
  const rows = await fetchTable(body.command, body.step);
  const first = rows[0];
  if (!first || rows.some((r) => r.length !== 7 || r.some((v) => !Number.isFinite(v)))) {
    throw new Error(`Bad rows for ${body.name}`);
  }
  const data = new Float64Array(4 + rows.length * 6);
  data.set([1, first[0] ?? 0, body.stepDays, rows.length]);
  rows.forEach((r, i) => {
    data.set(r.slice(1), 4 + i * 6);
  });
  const file = `public/data/${body.name}.ephem`;
  await writeFile(file, new Uint8Array(data.buffer));
  console.log(
    `${file}: ${String(rows.length)} samples, ${(data.byteLength / 1024).toFixed(0)} KiB`,
  );
}
