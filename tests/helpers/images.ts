import type { RasterImage } from '../../src/algorithms/types';

/** Builds an opaque image from a per-pixel RGB function. */
export function makeImage(
  width: number,
  height: number,
  rgb: (x: number, y: number) => readonly [number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgb(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

export function solidImage(width: number, height: number, gray: number): RasterImage {
  return makeImage(width, height, () => [gray, gray, gray]);
}

/**
 * A deterministic grayscale scene with smooth gradients and hard edges: a
 * diagonal ramp, a shaded disc and a dark bar.
 */
export function sceneImage(width: number, height: number): RasterImage {
  const cx = width * 0.6;
  const cy = height * 0.45;
  const radius = Math.min(width, height) * 0.3;
  return makeImage(width, height, (x, y) => {
    let v = 230 - Math.floor((100 * (x + y)) / (width + height));
    const d = Math.hypot(x - cx, y - cy);
    if (d < radius) v = 30 + Math.floor((150 * d) / radius);
    if (x > width * 0.1 && x < width * 0.25 && y > height * 0.2) v = 15;
    return [v, v, v];
  });
}
