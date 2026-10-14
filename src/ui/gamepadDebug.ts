/**
 * Raw gamepad viewer, shown with `?gamepad=debug`: every axis and button the
 * browser reports, with the range seen so far and the last control that
 * changed, for working out a device's layout (Stage 2 step 1).
 */

interface AxisTrack {
  min: number;
  max: number;
  last: number;
}

export function gamepadDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).get('gamepad') === 'debug';
}

export function createGamepadDebug(parent: HTMLElement) {
  const el = document.createElement('pre');
  el.className = 'gamepad-debug';
  parent.appendChild(el);

  const tracks = new Map<string, AxisTrack[]>();
  const lastPressed = new Map<string, boolean[]>();
  let lastChange = 'none yet';
  let lastText = 0;

  const bar = (v: number) => {
    const width = 21;
    const pos = Math.round(((v + 1) / 2) * (width - 1));
    return Array.from({ length: width }, (_, i) =>
      i === pos ? '█' : i === (width - 1) / 2 ? '|' : '·',
    ).join('');
  };

  return {
    update(nowMs: number) {
      const pads = navigator.getGamepads().filter((p): p is Gamepad => p !== null);
      for (const pad of pads) {
        const key = `${String(pad.index)}:${pad.id}`;
        const axes = tracks.get(key) ?? pad.axes.map((v) => ({ min: v, max: v, last: v }));
        tracks.set(key, axes);
        pad.axes.forEach((v, i) => {
          const t = axes[i];
          if (!t) return;
          if (Math.abs(v - t.last) > 0.15)
            lastChange = `axis ${String(i)} (pad ${String(pad.index)})`;
          t.last = v;
          t.min = Math.min(t.min, v);
          t.max = Math.max(t.max, v);
        });
        const pressed = lastPressed.get(key) ?? [];
        pad.buttons.forEach((b, i) => {
          if (b.pressed && !pressed[i])
            lastChange = `button ${String(i)} (pad ${String(pad.index)})`;
          pressed[i] = b.pressed;
        });
        lastPressed.set(key, pressed);
      }

      if (nowMs - lastText < 50) return;
      lastText = nowMs;
      if (pads.length === 0) {
        el.textContent =
          'GAMEPAD DEBUG\n\nNo gamepad visible yet.\nPress any button on the HOTAS: the browser\nonly shows a gamepad after its first input.';
        return;
      }
      const lines = ['GAMEPAD DEBUG', `Last changed: ${lastChange}`, ''];
      for (const pad of pads) {
        const axes = tracks.get(`${String(pad.index)}:${pad.id}`) ?? [];
        lines.push(
          `Pad ${String(pad.index)}: ${pad.id}`,
          `Mapping: ${pad.mapping || '(none)'}`,
          'Axes:',
        );
        pad.axes.forEach((v, i) => {
          const t = axes[i];
          const range = t ? `seen ${t.min.toFixed(2)} .. ${t.max.toFixed(2)}` : '';
          lines.push(
            `  ${String(i).padStart(2)}  ${v >= 0 ? '+' : ''}${v.toFixed(3)}  ${bar(v)}  ${range}`,
          );
        });
        const down = pad.buttons.flatMap((b, i) => (b.pressed ? [String(i)] : []));
        lines.push(
          `Buttons (${String(pad.buttons.length)}): pressed ${down.length ? down.join(', ') : 'none'}`,
          '',
        );
      }
      el.textContent = lines.join('\n');
    },
  };
}
