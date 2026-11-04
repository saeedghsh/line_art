import { describe, expect, it, vi } from 'vitest';
import { runAlgorithm } from '../../src/algorithms/run';
import { AlgorithmError, type Algorithm, type RasterImage } from '../../src/algorithms/types';
import { solidImage } from '../helpers/images';

function fakeAlgorithm(svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>') {
  const run = vi.fn(() => Promise.resolve({ svg }));
  const algorithm: Algorithm = {
    id: 'fake',
    name: 'Fake',
    description: '',
    sources: [],
    runtime: { label: 'test' },
    parameters: [
      { id: 'n', label: 'N', description: '', type: 'int', default: 3, min: 1, max: 9, step: 1 },
    ],
    run,
  };
  return { algorithm, run };
}

const context = () => ({ onProgress: () => undefined, signal: new AbortController().signal });

describe('runAlgorithm', () => {
  it('passes the image and resolved parameters to the algorithm', async () => {
    const { algorithm, run } = fakeAlgorithm();
    const image = solidImage(4, 3, 128);
    await runAlgorithm(algorithm, image, {}, context());
    expect(run).toHaveBeenCalledWith(image, { n: 3 }, expect.anything());
  });

  it.each<[string, RasterImage]>([
    ['zero width', { width: 0, height: 2, data: new Uint8ClampedArray(0) }],
    ['fractional size', { width: 1.5, height: 2, data: new Uint8ClampedArray(12) }],
    ['short pixel buffer', { width: 2, height: 2, data: new Uint8ClampedArray(15) }],
    [
      'wrong buffer type',
      { width: 1, height: 1, data: new Uint8Array(4) as unknown as Uint8ClampedArray },
    ],
  ])('rejects an image with %s', async (_, image) => {
    const { algorithm, run } = fakeAlgorithm();
    await expect(runAlgorithm(algorithm, image, {}, context())).rejects.toThrow(AlgorithmError);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects invalid parameters before running', async () => {
    const { algorithm, run } = fakeAlgorithm();
    await expect(
      runAlgorithm(algorithm, solidImage(2, 2, 0), { n: 10 }, context()),
    ).rejects.toThrow(/between 1 and 9/);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not start when already cancelled', async () => {
    const { algorithm, run } = fakeAlgorithm();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runAlgorithm(algorithm, solidImage(2, 2, 0), {}, { ...context(), signal: controller.signal }),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects output that is not an SVG document', async () => {
    await expect(
      runAlgorithm(fakeAlgorithm('<html></html>').algorithm, solidImage(2, 2, 0), {}, context()),
    ).rejects.toThrow(/did not produce an SVG/);
  });
});
