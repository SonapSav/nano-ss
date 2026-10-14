/**
 * Turns the site windows from moon-sites.sh into game data (Stage 5):
 * public/data/sites/<name>.bin (Int16 heights in 0.5 m units, row 0 north),
 * public/data/sites.json (metadata and pad positions), and
 * public/textures/site-<name>.ktx2 (surface colour). Picks the Shackleton
 * pad on the crater rim: the highest spot sloping under 3°.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const SRC = 'data-cache/sources/sites';
const HALF = 20_000;
const SIZE = 1000; // 40 m spacing over ±20 km (gdalwarp -tr 40 → 1000 px)
const STEP = (2 * HALF) / (SIZE - 1);
/** Wide ring around each site: ±200 km at 2 km (gdalwarp -tr 2000 → 200 px). */
const RING_HALF = 200_000;
const RING_SIZE = 200;

interface SiteSpec {
  name: string;
  title: string;
  centerLat: number;
  centerLon: number;
  /** Pad on the tangent plane, or a rim search around the window centre. */
  pad: { x: number; y: number } | { rimFrom: number; rimTo: number };
}

const SITES: SiteSpec[] = [
  {
    name: 'tranquility',
    title: 'Tranquility Base',
    centerLat: 0.67416,
    centerLon: 23.47314,
    pad: { x: 0, y: 0 },
  },
  {
    name: 'shackleton',
    title: 'Shackleton Rim',
    centerLat: -89.67,
    centerLon: 129.78,
    pad: { rimFrom: 9_500, rimTo: 14_000 },
  },
];

/** Reads the raw signed 16-bit heights written by moon-sites.sh (gdal_translate -of ENVI). */
async function readHeights(file: string, size = SIZE): Promise<Float32Array> {
  const bytes = await readFile(file);
  if (bytes.byteLength !== size * size * 2)
    throw new Error(`${file}: unexpected size ${String(bytes.byteLength)}`);
  const raw = new Int16Array(bytes.buffer, bytes.byteOffset, size * size);
  return Float32Array.from(raw, (v) => (v === -32768 ? 0 : v * 0.5)); // LOLA: 0.5 m per unit
}

const at = (h: Float32Array, x: number, y: number) => {
  const i = Math.round((x + HALF) / STEP);
  const j = Math.round((HALF - y) / STEP);
  return h[Math.min(SIZE - 1, Math.max(0, j)) * SIZE + Math.min(SIZE - 1, Math.max(0, i))] ?? 0;
};

/** Slope in degrees at (x, y) from heights 80 m either side. */
const slope = (h: Float32Array, x: number, y: number) => {
  const dx = (at(h, x + 80, y) - at(h, x - 80, y)) / 160;
  const dy = (at(h, x, y + 80) - at(h, x, y - 80)) / 160;
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
};

function choosePad(h: Float32Array, spec: SiteSpec): { x: number; y: number } {
  if ('x' in spec.pad) return spec.pad;
  const { rimFrom, rimTo } = spec.pad;
  let best = { x: 0, y: 0, height: -Infinity };
  for (let y = -rimTo; y <= rimTo; y += 100) {
    for (let x = -rimTo; x <= rimTo; x += 100) {
      const r = Math.hypot(x, y);
      if (r < rimFrom || r > rimTo || slope(h, x, y) > 3) continue;
      const height = at(h, x, y);
      if (height > best.height) best = { x, y, height };
    }
  }
  if (!Number.isFinite(best.height)) throw new Error(`${spec.name}: no flat rim spot found`);
  return { x: best.x, y: best.y };
}

/** Hillshade preview (sun from the north-west) for checking the data by eye. */
async function preview(h: Float32Array, file: string): Promise<void> {
  const out = Buffer.alloc(SIZE * SIZE);
  for (let j = 1; j < SIZE - 1; j++)
    for (let i = 1; i < SIZE - 1; i++) {
      const dx = ((h[j * SIZE + i + 1] ?? 0) - (h[j * SIZE + i - 1] ?? 0)) / (2 * STEP);
      const dy = ((h[(j - 1) * SIZE + i] ?? 0) - (h[(j + 1) * SIZE + i] ?? 0)) / (2 * STEP);
      const shade = (1 + (-dx * 0.7 + dy * 0.7)) / Math.sqrt(1 + dx * dx + dy * dy);
      out[j * SIZE + i] = Math.max(0, Math.min(255, Math.round(shade * 140)));
    }
  await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .resize(500, 500)
    .png()
    .toFile(file);
}

await mkdir('public/data/sites', { recursive: true });
await mkdir('data-cache/build', { recursive: true });
const meta = [];
for (const spec of SITES) {
  const heights = await readHeights(`${SRC}/${spec.name}-ldem.raw`);
  const ring = await readHeights(`${SRC}/${spec.name}-ring.raw`, RING_SIZE);
  let ringMin = Infinity;
  let ringMax = -Infinity;
  for (const v of ring) {
    ringMin = Math.min(ringMin, v);
    ringMax = Math.max(ringMax, v);
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of heights) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const pad = choosePad(heights, spec);
  console.log(
    `${spec.name}: heights ${min.toFixed(0)}..${max.toFixed(0)} m, ` +
      `pad (${String(pad.x)}, ${String(pad.y)}) at ${at(heights, pad.x, pad.y).toFixed(0)} m, slope ${slope(heights, pad.x, pad.y).toFixed(1)}°; ` +
      `ring ${ringMin.toFixed(0)}..${ringMax.toFixed(0)} m`,
  );
  // Window heights, then ring heights, both Int16 in 0.5 m units.
  const packed = Int16Array.from([...heights, ...ring], (v) => Math.round(v * 2));
  if (packed.length !== SIZE * SIZE + RING_SIZE * RING_SIZE)
    throw new Error(`${spec.name}: bad packed size`);
  await writeFile(`public/data/sites/${spec.name}.bin`, new Uint8Array(packed.buffer));
  await preview(heights, `data-cache/build/preview-site-${spec.name}.png`);

  // Surface colour: flipped like the other KTX2 textures (row 0 = south edge).
  const png = `data-cache/build/site-${spec.name}.png`;
  await sharp(`${SRC}/${spec.name}-wac.tif`)
    .resize(1024, 1024)
    .flip()
    .toColourspace('srgb')
    .png()
    .toFile(png);
  await run('ktx', [
    'create',
    '--format',
    'R8G8B8_SRGB',
    '--encode',
    'basis-lz',
    '--qlevel',
    '192',
    '--generate-mipmap',
    png,
    `public/textures/site-${spec.name}.ktx2`,
  ]);

  meta.push({
    name: spec.name,
    title: spec.title,
    centerLat: spec.centerLat,
    centerLon: spec.centerLon,
    size: SIZE,
    halfExtent: HALF,
    ringSize: RING_SIZE,
    ringHalfExtent: RING_HALF,
    padX: pad.x,
    padY: pad.y,
  });
}
await writeFile('public/data/sites.json', `${JSON.stringify(meta, null, 2)}\n`);
console.log('public/data/sites.json written');
