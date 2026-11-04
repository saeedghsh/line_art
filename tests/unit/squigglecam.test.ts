import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../../src/algorithms/parameters';
import { runAlgorithm } from '../../src/algorithms/run';
import { squigglecam } from '../../src/algorithms/squigglecam';
import {
  pathData,
  squiggleLines,
  squiggleSvg,
  type Point,
  type SquiggleSettings,
} from '../../src/algorithms/squigglecam/squiggle';
import type { RasterImage } from '../../src/algorithms/types';
import { processImage, svgChartLine } from '../reference/squigglecam/upstream.js';
import { makeImage, sceneImage, solidImage } from '../helpers/images';

const UPSTREAM_DEFAULTS: SquiggleSettings = {
  frequency: 150,
  amplitude: 1,
  lineCount: 50,
  brightness: 0,
  contrast: 0,
  minBrightness: 0,
  maxBrightness: 255,
  spacing: 1,
  black: false,
};

/**
 * Upstream reads "green" and "blue" from the red channel of the next two
 * pixels. On an image whose green and blue channels are the red channel
 * shifted by one and two pixels, that read and the corrected per-pixel read
 * coincide, so both implementations must agree exactly. Upstream also reads
 * past the last row, hence its buffer has one extra row.
 */
function channelShiftedImage(width: number, height: number) {
  const scene = sceneImage(width, height + 1);
  const red = (p: number) => scene.data[4 * Math.min(p, width * (height + 1) - 1)] ?? 0;
  const upstreamData = new Uint8ClampedArray(width * (height + 1) * 4);
  for (let p = 0; p < width * (height + 1); p++) {
    upstreamData.set([red(p), red(p + 1), red(p + 2), 255], 4 * p);
  }
  const image: RasterImage = {
    width,
    height,
    data: upstreamData.slice(0, width * height * 4),
  };
  return { image, upstreamData };
}

function runUpstream(image: RasterImage, upstreamData: Uint8ClampedArray, s: SquiggleSettings) {
  return processImage({
    config: { ...s, width: image.width, height: image.height },
    image: { data: upstreamData },
  });
}

/** Largest vertical distance of any point from its line's baseline. */
function maxDeviation(lines: readonly (readonly Point[])[]): number {
  return Math.max(...lines.flatMap((line) => line.map(([, y]) => Math.abs(y - line[0]![1]))));
}

describe('squiggleLines matches upstream SquiggleCam', () => {
  const { image, upstreamData } = channelShiftedImage(160, 120);

  it.each<[string, Partial<SquiggleSettings>]>([
    ['upstream defaults', {}],
    ['contrast and brightness', { contrast: 40, brightness: -20 }],
    ['black paper with low contrast', { contrast: -60, black: true, minBrightness: 30 }],
    [
      'brightness limits and fractional sampling',
      { minBrightness: 40, maxBrightness: 200, amplitude: 3.3, spacing: 0.7, frequency: 20 },
    ],
    ['range maxima', { lineCount: 120, spacing: 3, amplitude: 5, frequency: 256, contrast: 100 }],
    ['range minima', { lineCount: 10, spacing: 0.5, amplitude: 0.1, frequency: 5 }],
  ])('%s', (_, overrides) => {
    const settings = { ...UPSTREAM_DEFAULTS, ...overrides };
    const expected = runUpstream(image, upstreamData, settings);
    const actual = squiggleLines(image, settings);
    expect(actual).toEqual(expected);
    for (const line of actual) {
      expect(pathData(line)).toBe(svgChartLine.pathD.call({ d: { values: line } }));
    }
  });
});

describe('squiggleLines corrections', () => {
  it('uses the colour of the sampled pixel', () => {
    // Upstream sees only the red channel (0), i.e. black, and draws maximal waves.
    const green = makeImage(200, 100, () => [0, 255, 0]);
    const ours = squiggleLines(green, UPSTREAM_DEFAULTS);
    const upstream = runUpstream(green, green.data, UPSTREAM_DEFAULTS);
    const luminance = 0.7154 * 255;
    expect(maxDeviation(ours)).toBeCloseTo((255 - luminance) / 50, 2);
    expect(maxDeviation(upstream)).toBeCloseTo(255 / 50, 2);
  });

  it('terminates for images shorter than the line count', () => {
    const lines = squiggleLines(solidImage(50, 20, 128), { ...UPSTREAM_DEFAULTS, lineCount: 50 });
    expect(lines).toHaveLength(20);
  });
});

describe('squiggleLines behaviour', () => {
  const image = sceneImage(200, 150);

  it('draws flat lines on white and the tallest waves on black', () => {
    expect(maxDeviation(squiggleLines(solidImage(100, 100, 255), UPSTREAM_DEFAULTS))).toBe(0);
    expect(maxDeviation(squiggleLines(solidImage(100, 100, 0), UPSTREAM_DEFAULTS))).toBeCloseTo(
      255 / 50,
      2,
    );
  });

  it('inverts the response on black paper', () => {
    const settings = { ...UPSTREAM_DEFAULTS, black: true };
    expect(maxDeviation(squiggleLines(solidImage(100, 100, 0), settings))).toBe(0);
    expect(maxDeviation(squiggleLines(solidImage(100, 100, 255), settings))).toBeGreaterThan(5);
  });

  it('spaces lines by floor(height / lineCount)', () => {
    const lines = squiggleLines(image, { ...UPSTREAM_DEFAULTS, lineCount: 40 });
    expect(lines.map((line) => line[0]![1])).toEqual(Array.from({ length: 50 }, (_, i) => i * 3));
  });

  it('samples every `spacing` pixels', () => {
    const lines = squiggleLines(image, { ...UPSTREAM_DEFAULTS, spacing: 2.5 });
    expect(lines[0]!.map(([x]) => x).slice(0, 4)).toEqual([0, 2.5, 5, 7.5]);
    expect(lines[0]).toHaveLength(80);
  });

  it('scales wave height linearly with amplitude', () => {
    const base = maxDeviation(squiggleLines(image, UPSTREAM_DEFAULTS));
    const doubled = maxDeviation(squiggleLines(image, { ...UPSTREAM_DEFAULTS, amplitude: 2 }));
    expect(doubled).toBeCloseTo(2 * base, 6);
  });
});

describe('squiggleSvg', () => {
  const lines: Point[][] = [
    [
      [0, 0],
      [1, 0.123],
    ],
    [
      [0, 5],
      [1, 5.5],
    ],
  ];

  it('produces a sized SVG document with one path per line', () => {
    const svg = squiggleSvg(lines, { width: 300, height: 200, black: false });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="300" height="200"/);
    expect(svg).toContain('viewBox="0 0 300 200"');
    expect(svg).toContain('style="background: #FFFFFF"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg.match(/<path d="M [^"]+"\/>/g)).toEqual([
      '<path d="M 0,0L1,0.12"/>',
      '<path d="M 0,5L1,5.5"/>',
    ]);
  });

  it('draws white on black paper', () => {
    const svg = squiggleSvg(lines, { width: 300, height: 200, black: true });
    expect(svg).toContain('style="background: #000000"');
    expect(svg).toContain('stroke="#FFFFFF"');
  });
});

describe('squigglecam adapter', () => {
  const context = { onProgress: () => undefined, signal: new AbortController().signal };
  const image = sceneImage(400, 300);

  it('scales the image to the chosen width, keeping its aspect ratio', async () => {
    const result = await runAlgorithm(squigglecam, image, { width: 600 }, context);
    expect(result.svg).toContain('width="600" height="450" viewBox="0 0 600 450"');
    // floor(450 / 50) = 9 px between lines.
    expect(result.stats).toEqual({ strokes: 50, points: 50 * 600 });
  });

  it('responds to parameter changes', async () => {
    const base = await runAlgorithm(squigglecam, image, {}, context);
    const changed = await runAlgorithm(squigglecam, image, { frequency: 30 }, context);
    expect(changed.svg).not.toBe(base.svg);
    expect(changed.stats).toEqual(base.stats);
  });

  it.each(['min', 'max'] as const)('handles every parameter at its %s', async (bound) => {
    const params = Object.fromEntries(
      squigglecam.parameters.map((p) => [
        p.id,
        p.type === 'int' || p.type === 'float' ? p[bound] : p.default,
      ]),
    );
    const result = await runAlgorithm(squigglecam, image, params, context);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(result.stats?.strokes).toBeGreaterThan(0);
  });

  it('defaults reproduce the upstream defaults', () => {
    expect(defaultParameters(squigglecam.parameters)).toEqual({
      width: 500,
      paper: 'white',
      brightness: 0,
      contrast: 0,
      minBrightness: 0,
      maxBrightness: 255,
      frequency: 150,
      lineCount: 50,
      amplitude: 1,
      spacing: 1,
    });
  });
});
