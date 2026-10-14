/**
 * Converts the Yale Bright Star Catalogue (5th ed., CDS V/50; Hoffleit &
 * Warren 1991) into public/data/stars.bin: little-endian Float32 records of
 * [x, y, z, Vmag, B-V], unit vectors in ICRF/J2000, the same frame as the
 * game world, so constellations sit where they really are.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { download } from './download.ts';

const URL = 'https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz';
const file = await download(URL, 'data-cache/sources/bsc5-catalog.gz');
const text = gunzipSync(await readFile(file)).toString('latin1');

/** Fixed-width field by 1-based byte positions, as in the CDS ReadMe. */
const field = (line: string, from: number, to: number) => line.slice(from - 1, to).trim();

const records: number[] = [];
for (const line of text.split('\n')) {
  const rah = field(line, 76, 77);
  const vmag = field(line, 103, 107);
  if (!rah || !vmag) continue; // a few entries (novae, non-stellar objects) have no position
  const ra =
    ((Number(rah) + Number(field(line, 78, 79)) / 60 + Number(field(line, 80, 83)) / 3600) *
      15 *
      Math.PI) /
    180;
  const sign = field(line, 84, 84) === '-' ? -1 : 1;
  const dec =
    (sign *
      (Number(field(line, 85, 86)) +
        Number(field(line, 87, 88)) / 60 +
        Number(field(line, 89, 90)) / 3600) *
      Math.PI) /
    180;
  const bv = field(line, 110, 114);
  records.push(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
    Number(vmag),
    bv ? Number(bv) : 0.6,
  );
}
await writeFile('public/data/stars.bin', new Uint8Array(new Float32Array(records).buffer));
console.log(`public/data/stars.bin: ${String(records.length / 5)} stars`);
