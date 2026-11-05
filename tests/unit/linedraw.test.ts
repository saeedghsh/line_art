import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLinedraw } from '../../src/algorithms/linedraw';
import { defaultParameters } from '../../src/algorithms/parameters';
import { runAlgorithm } from '../../src/algorithms/run';
import { AlgorithmError, type RasterImage } from '../../src/algorithms/types';
import { PythonCallError, type PythonRunner } from '../../src/runtimes/pyodide/python';
import { solidImage } from '../helpers/images';
import { noSignal, nodePythonRunner } from '../helpers/node-python';

const FIXTURES = new URL('../fixtures/linedraw/', import.meta.url);
const readFixture = (path: string) => readFileSync(new URL(path, FIXTURES), 'utf8');
const cases = JSON.parse(readFixture('cases.json')) as {
  name: string;
  params: Record<string, unknown>;
}[];

/** Everything after the root start tag, i.e. all polylines and the end tag. */
const svgBody = (svg: string) => svg.slice(svg.indexOf('>') + 1);

const context = (onProgress: (message: string) => void = () => undefined) => ({
  onProgress,
  signal: noSignal,
});

describe('linedraw in Pyodide', { timeout: 300_000 }, () => {
  let python: PythonRunner;
  let fixture: RasterImage;

  beforeAll(async () => {
    python = await nodePythonRunner();
    // Decode the PNG with Pillow, as upstream does, to get identical pixels.
    const decoded = (await python.call(
      {
        packages: ['pillow'],
        sources: {
          directory: '/home/pyodide/decode',
          files: {
            'decode_png.py': `
import io
from PIL import Image

def decode(png):
    image = Image.open(io.BytesIO(bytes(png))).convert("RGBA")
    return {"width": image.width, "height": image.height, "rgba": image.tobytes()}
`,
          },
        },
        module: 'decode_png',
        function: 'decode',
        kwargs: { png: new Uint8Array(readFileSync(new URL('input.png', FIXTURES))) },
      },
      { onOutput: () => undefined, signal: noSignal },
    )) as { width: number; height: number; rgba: Uint8Array };
    fixture = { ...decoded, data: new Uint8ClampedArray(decoded.rgba) };
  }, 300_000);

  it('uses the package versions the reference outputs were made with', () => {
    const lock = createRequire(import.meta.url)('pyodide/pyodide-lock.json') as {
      packages: Record<string, { version: string }>;
    };
    const recorded = JSON.parse(readFixture('versions.json')) as Record<string, string>;
    for (const [name, version] of Object.entries(recorded)) {
      expect(lock.packages[name]?.version, name).toBe(version);
    }
  });

  it.each(cases)('reproduces upstream linedraw exactly: $name', async ({ name, params }) => {
    const algorithm = createLinedraw(python);
    const result = await runAlgorithm(algorithm, fixture, params, context());
    const expected = readFixture(`expected/${name}.svg`);
    expect(svgBody(result.svg)).toBe(svgBody(expected));
    expect(result.svg).toMatch(/^<svg [^>]*width="[\d.]+" height="[\d.]+" viewBox="[-\d. ]+">/);
    expect(result.stats?.strokes).toBe(expected.match(/<polyline /g)?.length);
  });

  it('reports upstream progress messages', async () => {
    const messages: string[] = [];
    await runAlgorithm(
      createLinedraw(python),
      fixture,
      { resolution: 256 },
      context((m) => messages.push(m)),
    );
    expect(messages).toEqual(
      expect.arrayContaining(['finding edges...', 'hatching...', 'optimizing stroke sequence...']),
    );
  });

  it('responds to parameter changes', async () => {
    const algorithm = createLinedraw(python);
    const run = (params: Record<string, unknown>) =>
      runAlgorithm(algorithm, fixture, { resolution: 512, ...params }, context());
    const base = await run({});
    const reseeded = await run({ seed: 1 });
    const coarse = await run({ hatchSize: 32 });
    expect(reseeded.svg).not.toBe(base.svg);
    expect(reseeded.stats).toEqual(base.stats);
    expect(coarse.stats!.points).toBeLessThan(base.stats!.points);
  });

  it('returns an empty but valid drawing for a blank image', async () => {
    const result = await runAlgorithm(
      createLinedraw(python),
      solidImage(64, 48, 255),
      {},
      context(),
    );
    expect(result.stats).toEqual({ strokes: 0, points: 0 });
    expect(result.svg).toMatch(/^<svg [^>]*viewBox="0 0 512 384">/);
  });
});

describe('linedraw adapter', () => {
  const stubRunner = (call: PythonRunner['call']) => {
    const runner = {
      loadPackages: vi.fn<PythonRunner['loadPackages']>(() => Promise.resolve()),
      call: vi.fn(call),
    };
    return { runner, algorithm: createLinedraw(runner) };
  };
  const image = solidImage(40, 30, 128);
  const ok = () => Promise.resolve({ svg: '<svg></svg>', strokes: 0, points: 0 });

  it('defaults to the upstream command-line settings', () => {
    const { algorithm } = stubRunner(ok);
    expect(defaultParameters(algorithm.parameters)).toEqual({
      resolution: 1024,
      seed: 0,
      drawContours: true,
      edgeDetection: 'opencv',
      contourSimplify: 2,
      drawHatch: true,
      hatchSize: 16,
    });
  });

  it('only downloads OpenCV when Canny edge detection is selected', async () => {
    const { runner, algorithm } = stubRunner(ok);
    await runAlgorithm(algorithm, image, { edgeDetection: 'sobel' }, context());
    await algorithm.prepare?.({ ...defaultParameters(algorithm.parameters) }, context());
    expect(runner.call.mock.calls[0]?.[0].packages).toEqual(['pillow']);
    expect(runner.loadPackages.mock.calls[0]?.[0]).toEqual(['pillow', 'numpy', 'opencv-python']);
  });

  it('turns Python exceptions into user-facing errors with the traceback', async () => {
    const traceback = 'Traceback (most recent call last):\nValueError: bad image';
    const { algorithm } = stubRunner(() =>
      Promise.reject(new PythonCallError('ValueError', traceback)),
    );
    const error: unknown = await runAlgorithm(algorithm, image, {}, context()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AlgorithmError);
    expect(error).toMatchObject({
      message: 'linedraw failed: ValueError: bad image',
      details: traceback,
    });
  });

  it('explains runtime start-up failures, such as being offline', async () => {
    const { algorithm } = stubRunner(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );
    const error: unknown = await runAlgorithm(algorithm, image, {}, context()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AlgorithmError);
    expect((error as AlgorithmError).message).toMatch(/could not be started/);
    expect((error as AlgorithmError).details).toBe('Failed to fetch dynamically imported module');
  });

  it('lets cancellation through unchanged', async () => {
    const controller = new AbortController();
    const { algorithm } = stubRunner(() => {
      const reason = new DOMException('Cancelled', 'AbortError');
      controller.abort(reason);
      return Promise.reject(reason);
    });
    const error: unknown = await runAlgorithm(
      algorithm,
      image,
      {},
      {
        onProgress: () => undefined,
        signal: controller.signal,
      },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });

  it.each([
    ['too wide', solidImage(2000, 1, 0), /too wide/],
    ['too tall', solidImage(10, 100, 0), /too tall/],
  ])('rejects images that are %s before calling Python', async (_, input, message) => {
    const { runner, algorithm } = stubRunner(ok);
    await expect(runAlgorithm(algorithm, input, {}, context())).rejects.toThrow(message);
    expect(runner.call).not.toHaveBeenCalled();
  });

  it('rejects malformed results', async () => {
    const { algorithm } = stubRunner(() => Promise.resolve({ svg: 42 }));
    await expect(runAlgorithm(algorithm, image, {}, context())).rejects.toThrow(
      /unexpected result/,
    );
  });
});
