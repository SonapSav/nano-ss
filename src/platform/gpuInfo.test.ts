import { describe, expect, it } from 'vitest';
import { formatGpuReport } from './gpuInfo';

describe('formatGpuReport', () => {
  it('lists the adapter and key features for WebGPU', () => {
    const text = formatGpuReport({
      api: 'WebGPU',
      vendor: 'amd',
      architecture: 'gcn-5',
      features: new Set(['shader-f16', 'timestamp-query']),
    });
    expect(text).toBe('WebGPU | amd / gcn-5 | shader-f16 yes, timestamp-query yes, subgroups no');
  });

  it('omits feature flags for the WebGL2 fallback', () => {
    expect(formatGpuReport({ api: 'WebGL2', features: new Set() })).toBe('WebGL2');
  });
});
