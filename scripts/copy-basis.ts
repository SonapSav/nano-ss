/**
 * Copies three.js's Basis Universal transcoder (for KTX2 textures) into
 * public/basis/, matching the installed three version. Run before dev and build.
 */
import { copyFile, mkdir } from 'node:fs/promises';

const from = 'node_modules/three/examples/jsm/libs/basis';
await mkdir('public/basis', { recursive: true });
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  await copyFile(`${from}/${file}`, `public/basis/${file}`);
}
