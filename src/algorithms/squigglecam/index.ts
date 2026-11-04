import { resizeImage } from '../../utils/raster';
import { choiceParam, numberParam } from '../parameters';
import type { Algorithm, RasterImage } from '../types';
import { squiggleLines, squiggleSvg } from './squiggle';

const PAPER = 'Paper';
const ADJUSTMENTS = 'Image adjustments';
const SQUIGGLES = 'Squiggles';

// Scaling a large photo dominates the run time, so live parameter changes
// reuse the last scaled image.
let scaled: { source: RasterImage; image: RasterImage } | undefined;

function scaleToWidth(image: RasterImage, width: number): RasterImage {
  const height = Math.max(1, Math.round((width * image.height) / image.width));
  if (scaled?.source !== image || scaled.image.width !== width) {
    scaled = { source: image, image: resizeImage(image, width, height) };
  }
  return scaled.image;
}

export const squigglecam: Algorithm = {
  id: 'squigglecam',
  name: 'SquiggleCam',
  description:
    'Draws the image as horizontal sine waves whose height and frequency grow with the darkness underneath. Each line is a single continuous stroke, ideal for pen plotters.',
  sources: [
    {
      project: 'SquiggleCam',
      authors: 'Maksim Surguy',
      url: 'https://github.com/msurguy/SquiggleCam',
      license: 'MIT',
      commit: 'b33aab5c6e5b5176853245c67f18b0e862f252f0',
    },
    {
      project: 'SquiggleDraw',
      authors: 'Gregg Wygonik',
      url: 'https://github.com/gwygonik/SquiggleDraw',
      license: 'Unlicense',
      note: 'The original algorithm, which SquiggleCam implements for the web.',
    },
  ],
  adaptationNotes:
    'Ported from the Vue worker to TypeScript with the same arithmetic. Two fixes: brightness uses the R, G and B values of the sampled pixel (upstream read the red channel of neighbouring pixels), and line spacing is at least one pixel. The whole image is scaled to the chosen width instead of being cropped to a fixed paper size.',
  runtime: { label: 'JavaScript' },
  liveUpdate: true,
  parameters: [
    {
      id: 'width',
      label: 'Width',
      description:
        'Drawing width in pixels; the height follows the image. Wave sizes are in pixels, so wider drawings look finer.',
      group: PAPER,
      type: 'int',
      default: 500,
      min: 200,
      max: 1000,
      step: 10,
    },
    {
      id: 'paper',
      label: 'Paper colour',
      description: 'Black paper draws white lines and makes light areas squiggle instead.',
      group: PAPER,
      type: 'choice',
      default: 'white',
      options: [
        { value: 'white', label: 'White' },
        { value: 'black', label: 'Black' },
      ],
    },
    {
      id: 'brightness',
      label: 'Brightness',
      description: 'Added to every colour channel before drawing.',
      group: ADJUSTMENTS,
      type: 'int',
      default: 0,
      min: -100,
      max: 100,
      step: 1,
    },
    {
      id: 'contrast',
      label: 'Contrast',
      description: 'Positive values stretch the tonal range, negative values flatten it.',
      group: ADJUSTMENTS,
      type: 'int',
      default: 0,
      min: -100,
      max: 100,
      step: 1,
    },
    {
      id: 'minBrightness',
      label: 'Min brightness',
      description: 'Darker pixels are treated as this bright, which caps the tallest waves.',
      group: ADJUSTMENTS,
      type: 'int',
      default: 0,
      min: 0,
      max: 255,
      step: 1,
    },
    {
      id: 'maxBrightness',
      label: 'Max brightness',
      description: 'Pixels at least this bright draw flat lines.',
      group: ADJUSTMENTS,
      type: 'int',
      default: 255,
      min: 0,
      max: 255,
      step: 1,
    },
    {
      id: 'frequency',
      label: 'Frequency',
      description: 'Higher values give fewer, longer waves.',
      group: SQUIGGLES,
      type: 'int',
      default: 150,
      min: 5,
      max: 256,
      step: 1,
    },
    {
      id: 'lineCount',
      label: 'Line count',
      description: 'Number of horizontal lines.',
      group: SQUIGGLES,
      type: 'int',
      default: 50,
      min: 10,
      max: 200,
      step: 1,
    },
    {
      id: 'amplitude',
      label: 'Amplitude',
      description: 'Wave height multiplier.',
      group: SQUIGGLES,
      type: 'float',
      default: 1,
      min: 0.1,
      max: 5,
      step: 0.1,
    },
    {
      id: 'spacing',
      label: 'Sampling',
      description:
        'Horizontal distance between points in pixels; larger values give coarser waves.',
      group: SQUIGGLES,
      type: 'float',
      default: 1,
      min: 0.5,
      max: 3,
      step: 0.1,
    },
  ],

  run(image, params) {
    const pixels = scaleToWidth(image, numberParam(params, 'width'));
    const black = choiceParam(params, 'paper') === 'black';
    const lines = squiggleLines(pixels, {
      lineCount: numberParam(params, 'lineCount'),
      frequency: numberParam(params, 'frequency'),
      amplitude: numberParam(params, 'amplitude'),
      spacing: numberParam(params, 'spacing'),
      brightness: numberParam(params, 'brightness'),
      contrast: numberParam(params, 'contrast'),
      minBrightness: numberParam(params, 'minBrightness'),
      maxBrightness: numberParam(params, 'maxBrightness'),
      black,
    });
    return Promise.resolve({
      svg: squiggleSvg(lines, { width: pixels.width, height: pixels.height, black }),
      stats: {
        strokes: lines.length,
        points: lines.reduce((total, line) => total + line.length, 0),
      },
    });
  },
};
