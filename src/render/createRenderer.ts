import { AgXToneMapping, WebGPURenderer } from 'three/webgpu';
import type { RenderApi } from '../platform/gpuInfo';

export interface RendererHandle {
  renderer: WebGPURenderer;
  api: RenderApi;
}

/**
 * WebGPU renderer with automatic WebGL2 fallback (D-012). Device loss is
 * reported to `onDeviceLost`; full resource recovery comes in a later stage.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  onDeviceLost: (message: string) => void,
): Promise<RendererHandle> {
  // Reversed depth keeps precision from 0.1 m to the Sun without the cost of a logarithmic buffer.
  const renderer = new WebGPURenderer({ canvas, antialias: true, reversedDepthBuffer: true });
  // Render resolution is capped here; dynamic resolution scaling (D-010) comes later.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = AgXToneMapping;
  renderer.onDeviceLost = (info) => {
    onDeviceLost(`${info.api} device lost: ${info.message}`);
  };

  await renderer.init();

  const api: RenderApi = 'isWebGPUBackend' in renderer.backend ? 'WebGPU' : 'WebGL2';
  return { renderer, api };
}
