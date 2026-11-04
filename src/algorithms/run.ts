import { resolveParameters } from './parameters';
import {
  AlgorithmError,
  type Algorithm,
  type AlgorithmResult,
  type RasterImage,
  type RunContext,
} from './types';

/**
 * Runs `algorithm` after validating its inputs, so adapters can rely on a
 * well-formed image and a complete set of valid parameters.
 */
export async function runAlgorithm(
  algorithm: Algorithm,
  image: RasterImage,
  params: Readonly<Record<string, unknown>>,
  context: RunContext,
): Promise<AlgorithmResult> {
  assertValidImage(image);
  const values = resolveParameters(algorithm.parameters, params);
  context.signal.throwIfAborted();
  const result = await algorithm.run(image, values, context);
  if (!/^\s*<svg[\s>]/.test(result.svg)) {
    throw new AlgorithmError(`${algorithm.name} did not produce an SVG document.`);
  }
  return result;
}

export function assertValidImage(image: RasterImage): void {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new AlgorithmError(`Invalid image size ${width}×${height}.`);
  }
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new AlgorithmError('Image pixel data does not match its size.');
  }
}
