import { describe, expect, it } from 'vitest';
import { resizeImage } from '../../src/utils/raster';
import { makeImage, sceneImage, solidImage } from '../helpers/images';

const red = (image: { data: Uint8ClampedArray }) =>
  Array.from(image.data.filter((_, i) => i % 4 === 0));

describe('resizeImage', () => {
  it('returns the input when the size is unchanged', () => {
    const image = sceneImage(10, 8);
    expect(resizeImage(image, 10, 8)).toBe(image);
  });

  it.each([
    [40, 30, 7, 5],
    [7, 5, 40, 30],
    [30, 30, 30, 1],
  ])('keeps a uniform %ix%i image uniform at %ix%i', (w, h, tw, th) => {
    const result = resizeImage(solidImage(w, h, 77), tw, th);
    expect(result.width).toBe(tw);
    expect(result.height).toBe(th);
    expect(result.data).toHaveLength(tw * th * 4);
    expect(new Set(result.data)).toEqual(new Set([77, 255]));
  });

  it('averages detail away when shrinking', () => {
    const checkerboard = makeImage(64, 64, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
    for (const value of red(resizeImage(checkerboard, 8, 8))) {
      expect(value).toBeGreaterThanOrEqual(120);
      expect(value).toBeLessThanOrEqual(135);
    }
  });

  it('interpolates smoothly when enlarging', () => {
    const ramp = makeImage(4, 1, (x) => [x * 80, 0, 0]);
    const row = red(resizeImage(ramp, 16, 1));
    expect(row[0]).toBe(0);
    expect(row.at(-1)).toBe(240);
    expect(row).toEqual([...row].sort((a, b) => a - b));
  });
});
