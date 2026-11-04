import { AlgorithmError, type RasterImage } from '../algorithms/types';

/**
 * Longest side, in pixels, of images handed to algorithms. Both algorithms
 * downsample far below this, so larger photos are scaled down on load to
 * bound memory use; the UI says when that happens.
 */
export const MAX_IMAGE_DIMENSION = 4096;

export interface LoadedImage {
  readonly name: string;
  /** Object URL of the original file, for the preview. */
  readonly url: string;
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly raster: RasterImage;
}

/** Decodes an image file, applying EXIF orientation and flattening onto white. */
export async function loadImageFile(file: Blob, name: string): Promise<LoadedImage> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new AlgorithmError(`"${name}" is not an image.`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (cause) {
    throw new AlgorithmError(
      `Could not read "${name}". Your browser may not support this format; try PNG, JPEG or WebP.`,
      { cause },
    );
  }
  try {
    return {
      name,
      url: URL.createObjectURL(file),
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      raster: rasterize(bitmap),
    };
  } finally {
    bitmap.close();
  }
}

function rasterize(source: ImageBitmap): RasterImage {
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new AlgorithmError('This browser cannot decode images (no 2D canvas).');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** Draws a shaded still life to try the algorithms without an own image. */
export async function createSampleImage(): Promise<LoadedImage> {
  const width = 900;
  const height = 675;
  const canvas = new OffscreenCanvas(width, height);
  const c = canvas.getContext('2d');
  if (!c) throw new AlgorithmError('This browser cannot draw images (no 2D canvas).');

  const wall = c.createLinearGradient(0, 0, width, height * 0.7);
  wall.addColorStop(0, '#f2efe8');
  wall.addColorStop(1, '#9d9a94');
  c.fillStyle = wall;
  c.fillRect(0, 0, width, height);

  const table = c.createLinearGradient(0, height * 0.68, 0, height);
  table.addColorStop(0, '#6b5844');
  table.addColorStop(1, '#2a221a');
  c.fillStyle = table;
  c.fillRect(0, height * 0.68, width, height * 0.32);

  const sphere = (x: number, y: number, r: number, light: string, dark: string) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    c.beginPath();
    c.ellipse(x + r * 0.35, height * 0.7 + r * 0.12, r * 1.05, r * 0.22, 0, 0, 2 * Math.PI);
    c.fill();
    const shade = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x, y, r);
    shade.addColorStop(0, light);
    shade.addColorStop(1, dark);
    c.fillStyle = shade;
    c.beginPath();
    c.arc(x, y, r, 0, 2 * Math.PI);
    c.fill();
  };
  sphere(330, height * 0.7 - 150, 150, '#fafafa', '#1c1c1c');
  sphere(640, height * 0.7 - 85, 85, '#f7d9a8', '#5a2e0f');

  c.fillStyle = '#3d4b5c';
  c.beginPath();
  c.moveTo(70, height * 0.7);
  c.lineTo(150, height * 0.7 - 260);
  c.lineTo(230, height * 0.7);
  c.closePath();
  c.fill();

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return loadImageFile(blob, 'sample.png');
}
