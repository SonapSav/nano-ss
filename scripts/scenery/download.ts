import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';

/** Downloads `url` to `file` unless a complete copy is already cached in data-cache/. */
export async function download(url: string, file: string): Promise<string> {
  try {
    if ((await stat(file)).size > 0) return file;
  } catch {
    // Not cached yet.
  }
  await mkdir(dirname(file), { recursive: true });
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${String(response.status)}`);
  const partial = `${file}.part`;
  await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(partial));
  await rename(partial, file);
  return file;
}
