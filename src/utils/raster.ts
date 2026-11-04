import type { RasterImage } from '../algorithms/types';

/**
 * Resamples `image` with a triangle filter that widens with the reduction
 * factor (antialiased bilinear, as in Pillow). Unlike canvas scaling, the
 * result is identical in every browser and in tests.
 */
export function resizeImage(image: RasterImage, width: number, height: number): RasterImage {
  if (width === image.width && height === image.height) return image;

  // Horizontal pass into floating point, then vertical pass into bytes.
  const partial = new Float32Array(width * image.height * 4);
  filterTaps(image.width, width).forEach((taps, x) => {
    for (let y = 0; y < image.height; y++) {
      accumulate(image.data, y * image.width * 4, 4, taps, partial, (y * width + x) * 4);
    }
  });
  const data = new Uint8ClampedArray(width * height * 4);
  filterTaps(image.height, height).forEach((taps, y) => {
    for (let x = 0; x < width; x++) {
      accumulate(partial, x * 4, width * 4, taps, data, (y * width + x) * 4);
    }
  });
  return { width, height, data };
}

interface Taps {
  readonly first: number;
  readonly weights: Float64Array;
}

function filterTaps(sourceSize: number, targetSize: number): Taps[] {
  const scale = sourceSize / targetSize;
  const support = Math.max(1, scale);
  return Array.from({ length: targetSize }, (_, i) => {
    const center = (i + 0.5) * scale;
    const first = Math.max(0, Math.floor(center - support));
    const last = Math.min(sourceSize, Math.ceil(center + support));
    const weights = new Float64Array(last - first);
    let total = 0;
    for (let j = first; j < last; j++) {
      const weight = Math.max(0, 1 - Math.abs(j + 0.5 - center) / support);
      weights[j - first] = weight;
      total += weight;
    }
    // The nearest source pixel always has a positive weight, so total > 0.
    return { first, weights: weights.map((weight) => weight / total) };
  });
}

/** Writes the weighted sum of the RGBA samples selected by `taps`. */
function accumulate(
  source: Uint8ClampedArray | Float32Array,
  base: number,
  stride: number,
  taps: Taps,
  target: Float32Array | Uint8ClampedArray,
  offset: number,
): void {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let index = base + taps.first * stride;
  for (const weight of taps.weights) {
    r += weight * (source[index] ?? 0);
    g += weight * (source[index + 1] ?? 0);
    b += weight * (source[index + 2] ?? 0);
    a += weight * (source[index + 3] ?? 0);
    index += stride;
  }
  target[offset] = r;
  target[offset + 1] = g;
  target[offset + 2] = b;
  target[offset + 3] = a;
}
