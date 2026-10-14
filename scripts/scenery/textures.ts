/**
 * Builds the Earth and Moon textures (Stage 3c, D-022): downloads NASA
 * public-domain sources into data-cache/, resizes them, and encodes
 * GPU-compressed KTX2 files into public/textures/ (committed). The number of
 * parallel jobs follows the worker rule: CPU threads and free memory,
 * overridable with NANO_SS_WORKERS.
 */
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { availableParallelism, freemem } from 'node:os';
import { promisify } from 'node:util';
import sharp, { type Sharp } from 'sharp';
import { computeWorkerCount } from '../../src/platform/workerBudget.ts';
import { download } from './download.ts';

const run = promisify(execFile);
const SOURCES = 'data-cache/sources';
const BUILD = 'data-cache/build';
const OUT = 'public/textures';

interface Job {
  name: string;
  /** Download URL, or a file already fetched into data-cache/sources by moon-sources.sh. */
  url?: string;
  file?: string;
  width: number;
  height: number;
  /** sRGB for colour images, linear for data such as cloud cover. */
  colorSpace: 'srgb' | 'linear';
  /**
   * Data products such as albedo store small integer values in 16 bits:
   * stretch the 1st to 99.5th percentile of non-zero values to full 8-bit range.
   */
  stretch16?: boolean;
  /** Build a tangent-space normal map from an elevation model instead of a colour image. */
  normalFromElevation?: { metresPerUnit: number; bodyRadius: number; exaggeration: number };
  /** Encoder: Basis ETC1S (small) for colour, UASTC (higher quality) for normal maps. */
  encode?: 'basis-lz' | 'uastc';
}

const JOBS: Job[] = [
  {
    name: 'earth-day',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
    width: 4096,
    height: 2048,
    colorSpace: 'srgb',
  },
  {
    name: 'earth-night',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
    width: 4096,
    height: 2048,
    colorSpace: 'srgb',
  },
  {
    name: 'earth-clouds',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
    width: 2048,
    height: 1024,
    colorSpace: 'linear',
  },
  {
    // LROC WAC global mosaic (NASA/GSFC/Arizona State University), reduced by moon-sources.sh.
    name: 'moon-color',
    file: 'data-cache/sources/moon-wac.tif',
    width: 4096,
    height: 2048,
    colorSpace: 'srgb',
  },
  {
    // LOLA global elevation (NASA/GSFC), 0.5 m units, reduced by moon-sources.sh.
    name: 'moon-normal',
    file: 'data-cache/sources/moon-ldem.tif',
    width: 4096,
    height: 2048,
    colorSpace: 'linear',
    normalFromElevation: { metresPerUnit: 0.5, bodyRadius: 1_737_400, exaggeration: 2 },
    encode: 'uastc',
  },
];

/** Reads a one-channel 16-bit image and maps its useful value range onto 0..255. */
async function stretchTo8Bit(source: string): Promise<Sharp> {
  // Stay in 16-bit greyscale: a colour conversion would rescale the small values to 0.
  const { data, info } = await sharp(source, { limitInputPixels: false })
    .toColourspace('grey16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true });
  const values = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const sorted = Uint16Array.from(values.filter((v) => v > 0)).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)] ?? 0;
  const hi = sorted[Math.floor(sorted.length * 0.995)] ?? 1;
  const out = Buffer.alloc(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    out[i] = Math.round(255 * Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
  }
  console.log(`stretched ${source}: values ${String(lo)}..${String(hi)} -> 0..255`);
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } });
}

/**
 * Tangent-space normal map from an equirectangular elevation model (rows
 * north to south, longitude -180..180): +X east, +Y north, +Z up.
 */
async function normalMap(source: string, job: Job): Promise<Sharp> {
  const cfg = job.normalFromElevation;
  if (!cfg) throw new Error('normalMap needs normalFromElevation');
  const { data, info } = await sharp(source, { limitInputPixels: false })
    .resize(job.width, job.height, { fit: 'fill', kernel: 'cubic' })
    .toColourspace('grey16')
    .raw({ depth: 'short' })
    .toBuffer({ resolveWithObject: true });
  const h = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const { width: w, height: ht } = info;
  const at = (x: number, y: number) =>
    (h[((y + ht) % ht) * w + ((x + w) % w)] ?? 0) * cfg.metresPerUnit;
  const out = Buffer.alloc(w * ht * 3);
  const dy = (Math.PI * cfg.bodyRadius) / ht; // metres per pixel north-south
  for (let y = 0; y < ht; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / ht) * Math.PI;
    const dx = Math.max((2 * Math.PI * cfg.bodyRadius * Math.cos(lat)) / w, dy * 0.05); // metres per pixel east-west
    for (let x = 0; x < w; x++) {
      const east = ((at(x + 1, y) - at(x - 1, y)) / (2 * dx)) * cfg.exaggeration;
      const north = ((at(x, y - 1) - at(x, y + 1)) / (2 * dy)) * cfg.exaggeration;
      const len = Math.hypot(east, north, 1);
      const i = (y * w + x) * 3;
      out[i] = Math.round(((-east / len) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((-north / len) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    }
  }
  return sharp(out, { raw: { width: w, height: ht, channels: 3 } });
}

async function build(job: Job, threads: number): Promise<void> {
  let source = job.file;
  if (job.url) {
    const ext = job.url.slice(job.url.lastIndexOf('.'));
    source = await download(job.url, `${SOURCES}/${job.name}${ext}`);
  }
  if (!source) throw new Error(`${job.name}: no source`);
  const png = `${BUILD}/${job.name}.png`;
  const input = job.normalFromElevation
    ? await normalMap(source, job)
    : job.stretch16
      ? await stretchTo8Bit(source)
      : sharp(source, { limitInputPixels: false });
  // KTX2 textures are not flipped on upload, so flip once here: row 0 becomes the
  // south edge, matching three.js sphere UVs (v = 0 at the south pole).
  await input
    .resize(job.width, job.height, { fit: 'fill' })
    .flip()
    .removeAlpha()
    .toColourspace('srgb')
    .png()
    .toFile(png);

  const out = `${OUT}/${job.name}.ktx2`;
  await run('ktx', [
    'create',
    '--format',
    job.colorSpace === 'srgb' ? 'R8G8B8_SRGB' : 'R8G8B8_UNORM',
    ...(job.encode === 'uastc'
      ? ['--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18']
      : ['--encode', 'basis-lz', '--qlevel', '192']),
    '--generate-mipmap',
    '--threads',
    String(threads),
    png,
    out,
  ]);
  console.log(`${out} done`);
}

const override = process.env.NANO_SS_WORKERS ? Number(process.env.NANO_SS_WORKERS) : undefined;
const workers = computeWorkerCount({
  threads: availableParallelism(),
  memoryGB: freemem() / 2 ** 30,
  perWorkerMB: 2000, // decoding the 13500 × 6750 night image is the largest job
  reserveThreads: 1,
  memoryShare: 0.5,
  override,
});
const threadsPerJob = Math.max(1, Math.floor(availableParallelism() / workers));
console.log(
  `textures: ${String(workers)} parallel jobs, ${String(threadsPerJob)} encoder threads each`,
);

await mkdir(BUILD, { recursive: true });
await mkdir(OUT, { recursive: true });
// NANO_SS_ONLY=name,name builds just those textures.
const only = process.env.NANO_SS_ONLY?.split(',');
const queue = JOBS.filter((job) => !only || only.includes(job.name));
await Promise.all(
  Array.from({ length: Math.min(workers, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await build(job, threadsPerJob);
  }),
);
