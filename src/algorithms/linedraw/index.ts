import { PythonCallError, type PythonRunner } from '../../runtimes/pyodide/python';
import { booleanParam, choiceParam, numberParam } from '../parameters';
import {
  AlgorithmError,
  type Algorithm,
  type AlgorithmResult,
  type ParameterValues,
} from '../types';
import linedrawWeb from './linedraw_web.py?raw';
import filters from './upstream/filters.py?raw';
import linedraw from './upstream/linedraw.py?raw';
import perlin from './upstream/perlin.py?raw';
import strokesort from './upstream/strokesort.py?raw';
import util from './upstream/util.py?raw';

const SOURCES = {
  directory: '/home/pyodide/linedraw',
  files: {
    'linedraw_web.py': linedrawWeb,
    'linedraw.py': linedraw,
    'filters.py': filters,
    'strokesort.py': strokesort,
    'perlin.py': perlin,
    'util.py': util,
  },
};

/** Tallest processing height accepted; linedraw's run time grows quadratically. */
const MAX_PROCESSING_HEIGHT = 4096;

const GENERAL = 'General';
const CONTOURS = 'Contours';
const HATCHING = 'Hatching';

function packagesFor(params: ParameterValues): string[] {
  return choiceParam(params, 'edgeDetection') === 'opencv'
    ? ['pillow', 'numpy', 'opencv-python']
    : ['pillow'];
}

/** Creates the linedraw algorithm, executing Python through `python`. */
export function createLinedraw(python: PythonRunner): Algorithm {
  return {
    id: 'linedraw',
    name: 'linedraw',
    description:
      'Traces edges as contour lines and shades dark areas with cross-hatching, with a sketchy, hand-drawn wobble from Perlin noise. Strokes are ordered to reduce pen travel on a plotter.',
    sources: [
      {
        project: 'linedraw',
        authors: 'Lingdong Huang',
        url: 'https://github.com/LingDong-/linedraw',
        license: 'MIT',
        commit: '3aedc2f61d0ef3a3eb2e1ba18b933cbcd95a44ad',
      },
    ],
    adaptationNotes:
      'Runs the original, unmodified Python code in the browser with Pyodide. A small wrapper replaces its file input and output, gives the SVG the size attributes browsers need, and seeds the noise so results are reproducible. The processing resolution, fixed at 1024 upstream, can be lowered.',
    runtime: {
      label: 'Python (Pyodide)',
      note: 'The first run downloads a Python runtime from the jsDelivr CDN: about 13 MB, plus 14 MB for OpenCV edge detection. Your browser caches it afterwards.',
    },
    parameters: [
      {
        id: 'resolution',
        label: 'Resolution',
        description:
          'Width in pixels the image is processed at; upstream always uses 1024. Lower is faster and coarser.',
        group: GENERAL,
        type: 'int',
        default: 1024,
        min: 256,
        max: 1024,
        step: 64,
      },
      {
        id: 'seed',
        label: 'Seed',
        description:
          'Seeds the noise that makes strokes look hand-drawn. Upstream picks a new random seed on every run.',
        group: GENERAL,
        type: 'int',
        default: 0,
        min: 0,
        max: 9999,
        step: 1,
      },
      {
        id: 'drawContours',
        label: 'Draw contours',
        description: 'Trace the edges of shapes.',
        group: CONTOURS,
        type: 'boolean',
        default: true,
      },
      {
        id: 'edgeDetection',
        label: 'Edge detection',
        description:
          "OpenCV's Canny detector is upstream's default when OpenCV is installed, and faster. Sobel is upstream's pure-Python fallback (--no_cv) and avoids the OpenCV download.",
        group: CONTOURS,
        type: 'choice',
        default: 'opencv',
        options: [
          { value: 'opencv', label: 'OpenCV Canny' },
          { value: 'sobel', label: 'Sobel (pure Python)' },
        ],
      },
      {
        id: 'contourSimplify',
        label: 'Contour simplification',
        description: 'Higher values trace edges on a coarser grid, giving fewer, simpler lines.',
        group: CONTOURS,
        type: 'int',
        default: 2,
        min: 1,
        max: 4,
        step: 1,
      },
      {
        id: 'drawHatch',
        label: 'Draw hatching',
        description: 'Shade darker areas with one, two or three layers of hatch lines.',
        group: HATCHING,
        type: 'boolean',
        default: true,
      },
      {
        id: 'hatchSize',
        label: 'Hatch size',
        description:
          'Size in pixels of the cells hatching is decided on. Smaller cells give finer shading but take much longer.',
        group: HATCHING,
        type: 'int',
        default: 16,
        min: 8,
        max: 64,
        step: 1,
      },
    ],

    async prepare(params, { onProgress, signal }) {
      await python.loadPackages(packagesFor(params), { onOutput: onProgress, signal });
    },

    async run(image, params, { onProgress, signal }) {
      const { width, height } = image;
      const resolution = numberParam(params, 'resolution');
      const drawContours = booleanParam(params, 'drawContours');
      const drawHatch = booleanParam(params, 'drawHatch');
      const contourSimplify = numberParam(params, 'contourSimplify');
      const hatchSize = numberParam(params, 'hatchSize');

      // linedraw resizes to `resolution // step` columns and that many times
      // height / width rows (integer arithmetic), which must be at least 1.
      const rows = (step: number) => Math.floor((Math.floor(resolution / step) * height) / width);
      if ((drawContours && rows(contourSimplify) < 1) || (drawHatch && rows(hatchSize) < 1)) {
        throw new AlgorithmError(
          'The image is too wide for these settings. Crop it, raise the resolution or lower the hatch size and contour simplification.',
        );
      }
      if ((resolution * height) / width > MAX_PROCESSING_HEIGHT) {
        throw new AlgorithmError(
          `The image is too tall: linedraw would process it at ${resolution}×${Math.round((resolution * height) / width)} pixels. Crop it or lower the resolution.`,
        );
      }

      let result: unknown;
      try {
        result = await python.call(
          {
            packages: packagesFor(params),
            sources: SOURCES,
            module: 'linedraw_web',
            function: 'render',
            kwargs: {
              rgba: image.data,
              width,
              height,
              resolution,
              draw_contours: drawContours,
              draw_hatch: drawHatch,
              hatch_size: hatchSize,
              contour_simplify: contourSimplify,
              use_opencv: choiceParam(params, 'edgeDetection') === 'opencv',
              seed: numberParam(params, 'seed'),
            },
          },
          { onOutput: onProgress, signal },
        );
      } catch (error) {
        if (error instanceof PythonCallError) {
          throw new AlgorithmError(`linedraw failed: ${error.message}`, {
            cause: error,
            details: error.traceback,
          });
        }
        if (signal.aborted) throw error;
        // Typically the runtime could not be downloaded, e.g. when offline.
        throw new AlgorithmError(
          'The Python runtime could not be started. Check your internet connection and try again.',
          { cause: error, details: error instanceof Error ? error.message : String(error) },
        );
      }
      return toResult(result);
    },
  };
}

function toResult(value: unknown): AlgorithmResult {
  const { svg, strokes, points } = (value ?? {}) as Record<string, unknown>;
  if (typeof svg !== 'string' || typeof strokes !== 'number' || typeof points !== 'number') {
    throw new Error('linedraw returned an unexpected result.');
  }
  return { svg, stats: { strokes, points } };
}
