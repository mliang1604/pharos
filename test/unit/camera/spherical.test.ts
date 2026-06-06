import { describe, it, expect } from 'vitest';
import { sphericalToCartesian } from '@/camera/spherical';

describe('sphericalToCartesian', () => {
  it('azimuth 0, elevation 0 places the offset on +Z at radius distance', () => {
    expect(Array.from(sphericalToCartesian(5, 0, 0))).toEqual([
      expect.closeTo(0),
      expect.closeTo(0),
      expect.closeTo(5),
    ]);
  });

  it('azimuth 90° swings the offset onto +X', () => {
    expect(Array.from(sphericalToCartesian(5, Math.PI / 2, 0))).toEqual([
      expect.closeTo(5),
      expect.closeTo(0),
      expect.closeTo(0),
    ]);
  });

  it('elevation 90° points the offset straight up on +Y', () => {
    expect(Array.from(sphericalToCartesian(5, 0, Math.PI / 2))).toEqual([
      expect.closeTo(0),
      expect.closeTo(5),
      expect.closeTo(0),
    ]);
  });

  it('scales linearly with radius', () => {
    expect(Array.from(sphericalToCartesian(10, 0, 0))).toEqual([
      expect.closeTo(0),
      expect.closeTo(0),
      expect.closeTo(10),
    ]);
  });
});
