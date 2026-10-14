import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Certificates come from `make certs` (D-013). Without them the dev server
// falls back to plain HTTP, which still works on http://localhost.
const certFile = 'certs/server.crt';
const keyFile = 'certs/server.key';
const tls =
  existsSync(certFile) && existsSync(keyFile)
    ? { https: { cert: readFileSync(certFile), key: readFileSync(keyFile) } }
    : {};

// Same cross-origin isolation headers as docker/headers.conf, so dev and
// production behave alike (SharedArrayBuffer for workers).
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { host: true, port: 5173, strictPort: true, headers, ...tls },
  preview: { host: true, port: 4173, strictPort: true, headers, ...tls },
  build: { target: 'es2023' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
