import { describe, expect, it } from 'vitest';
import { edgeMarkerPosition } from './edgeMarker';

describe('edgeMarkerPosition', () => {
  it('puts a marker far to the right on the right edge', () => {
    const p = edgeMarkerPosition(3, 0.3);
    expect(p.x).toBeCloseTo(0.9);
    expect(p.y).toBeCloseTo(0.09);
    expect(p.angle).toBeCloseTo(Math.atan2(0.3, 3));
  });

  it('puts a marker above the view on the top edge', () => {
    const p = edgeMarkerPosition(0.2, 5);
    expect(p.y).toBeCloseTo(0.9);
    expect(Math.abs(p.x)).toBeLessThan(0.9);
  });

  it('puts a marker straight behind at the bottom', () => {
    expect(edgeMarkerPosition(0, 0)).toEqual({ x: 0, y: -0.9, angle: -Math.PI / 2 });
  });

  it('keeps the side of a marker that is behind and to the left', () => {
    expect(edgeMarkerPosition(-0.4, -0.1).x).toBeCloseTo(-0.9);
  });
});
