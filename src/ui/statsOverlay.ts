/** Corner readout: backend, frame rate, frame time, worker budget. */
export function createStatsOverlay(parent: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'stats';
  parent.appendChild(el);

  let label = '';
  let frames = 0;
  let windowStart = performance.now();
  let lastFrame = windowStart;
  let worstMs = 0;

  return {
    setLabel(text: string) {
      label = text;
      el.textContent = label;
    },
    frame(now: number) {
      worstMs = Math.max(worstMs, now - lastFrame);
      lastFrame = now;
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 500) {
        const fps = (frames * 1000) / elapsed;
        el.textContent = `${label}\n${fps.toFixed(0)} fps | avg ${(elapsed / frames).toFixed(1)} ms | worst ${worstMs.toFixed(1)} ms`;
        frames = 0;
        worstMs = 0;
        windowStart = now;
      }
    },
    showError(message: string) {
      el.classList.add('error');
      el.textContent = message;
    },
  };
}
