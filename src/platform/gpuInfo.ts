/**
 * GPU report logged at startup (PROJECT.md, Hardware Baseline rule), so
 * performance numbers can always be tied to the backend actually in use.
 */

export type RenderApi = 'WebGPU' | 'WebGL2';

/** WebGPU features that matter for later stages. */
export const KEY_FEATURES = ['shader-f16', 'timestamp-query', 'subgroups'] as const;

export interface GpuReport {
  api: RenderApi;
  vendor?: string;
  architecture?: string;
  description?: string;
  features: ReadonlySet<string>;
}

export async function describeGpu(api: RenderApi): Promise<GpuReport> {
  if (api !== 'WebGPU' || !('gpu' in navigator)) {
    return { api, features: new Set() };
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    return { api, features: new Set() };
  }
  const { vendor, architecture, description } = adapter.info;
  return { api, vendor, architecture, description, features: new Set(adapter.features) };
}

export function formatGpuReport(report: GpuReport): string {
  const parts: string[] = [report.api];
  const name = [report.vendor, report.architecture].filter(Boolean).join(' / ');
  if (name) parts.push(name);
  if (report.description) parts.push(report.description);
  if (report.api === 'WebGPU') {
    const flags = KEY_FEATURES.map((f) => `${f} ${report.features.has(f) ? 'yes' : 'no'}`);
    parts.push(flags.join(', '));
  }
  return parts.join(' | ');
}
