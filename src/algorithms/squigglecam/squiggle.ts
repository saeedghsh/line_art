/*
 * SquiggleCam line generation and SVG serialisation, ported to TypeScript.
 *
 * Source: SquiggleCam by Maksim Surguy, https://github.com/msurguy/SquiggleCam
 * at commit b33aab5c6e5b5176853245c67f18b0e862f252f0:
 *   - src/App.vue, the worker function in `processImage()` -> squiggleLines()
 *   - src/components/svgChartLine.vue, `pathD()`            -> pathData()
 *   - src/components/svgChart.vue, the <svg> template       -> squiggleSvg()
 * Copyright (c) 2019 Maksim Surguy. MIT License, see ./LICENSE.
 *
 * SquiggleCam is a web implementation of SquiggleDraw by Gregg Wygonik
 * (https://github.com/gwygonik/SquiggleDraw).
 *
 * The arithmetic and its evaluation order are kept as in upstream so results
 * match exactly. Deliberate changes are marked "MODIFIED" and listed in
 * THIRD_PARTY_NOTICES.md.
 */
import type { RasterImage } from '../types';

export interface SquiggleSettings {
  /** Number of horizontal lines. */
  readonly lineCount: number;
  /** Divisor of the per-sample phase advance; higher means fewer waves. */
  readonly frequency: number;
  /** Multiplier of the wave height. */
  readonly amplitude: number;
  /** Horizontal distance between samples, in pixels. */
  readonly spacing: number;
  /** Added to each channel, -100..100 in the original UI. */
  readonly brightness: number;
  /** -100..100 in the original UI; 0 disables the contrast adjustment. */
  readonly contrast: number;
  readonly minBrightness: number;
  readonly maxBrightness: number;
  /** Draw white lines on black paper, inverting the brightness response. */
  readonly black: boolean;
}

export type Point = readonly [x: number, y: number];

export function squiggleLines(image: RasterImage, settings: SquiggleSettings): Point[][] {
  const { width, height, data } = image;
  const { lineCount, frequency, amplitude, spacing, brightness, contrast, black } = settings;
  const { minBrightness, maxBrightness } = settings;

  const lines: Point[][] = [];
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  // MODIFIED: upstream used `Math.floor(height / lineCount)`, which is 0 (an
  // endless loop) for images shorter than the line count.
  const horizontalLineSpacing = Math.max(1, Math.floor(height / lineCount));

  for (let y = 0; y < height; y += horizontalLineSpacing) {
    let a = 0;
    const line: Point[] = [[0, y]];
    const rowStart = y * width;

    for (let x = spacing; x < width; x += spacing) {
      const pixel = 4 * Math.floor(x + rowStart);
      // MODIFIED: upstream read green and blue from `data[4 * (index + 1)]` and
      // `data[4 * (index + 2)]`, i.e. the red channel of the next two pixels
      // (and past the end of the buffer on the last row).
      const red = data[pixel] ?? 0;
      const green = data[pixel + 1] ?? 0;
      const blue = data[pixel + 2] ?? 0;

      let b: number;
      if (contrast !== 0) {
        b =
          0.2125 * (contrastFactor * (red - 128) + 128 + brightness) +
          0.7154 * (contrastFactor * (green - 128) + 128 + brightness) +
          0.0721 * (contrastFactor * (blue - 128) + 128 + brightness);
      } else {
        b =
          0.2125 * (red + brightness) +
          0.7154 * (green + brightness) +
          0.0721 * (blue + brightness);
      }

      if (black) {
        b = Math.min(255 - minBrightness, 255 - b);
      } else {
        b = Math.max(minBrightness, b);
      }
      const z = Math.max(maxBrightness - b, 0);

      // The squiggle: darker pixels give taller and faster waves.
      const r = (amplitude * z) / lineCount;
      a += z / frequency;
      line.push([x, y + Math.sin(a) * r]);
    }
    lines.push(line);
  }
  return lines;
}

/** SVG path data for one line, rounded to two decimals as upstream. */
export function pathData(line: readonly Point[]): string {
  return line
    .map(([x, y], index) =>
      index === 0 ? `M ${x},${y}` : `L${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`,
    )
    .join('');
}

export function squiggleSvg(
  lines: readonly (readonly Point[])[],
  options: { readonly width: number; readonly height: number; readonly black: boolean },
): string {
  const { width, height, black } = options;
  const background = black ? '#000000' : '#FFFFFF';
  const stroke = black ? '#FFFFFF' : '#000000';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: ${background}">`,
    `<g fill="none" stroke="${stroke}" stroke-width="2">`,
    ...lines.map((line) => `<path d="${pathData(line)}"/>`),
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
