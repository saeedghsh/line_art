/**
 * The contract between the playground and its drawing algorithms.
 *
 * An algorithm is a plain object: metadata the UI renders (description,
 * credits, parameters) plus an asynchronous `run` that turns a raster image
 * into an SVG document. How it executes (TypeScript on the main thread,
 * Python in a Pyodide worker, ...) is an implementation detail of its adapter.
 */

/**
 * Opaque 8-bit RGBA pixels in row-major order, structurally compatible with
 * `ImageData`. The app composites transparency onto white before handing an
 * image to an algorithm.
 */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

interface ParameterBase {
  /** Key in the parameter values passed to `run`. */
  readonly id: string;
  readonly label: string;
  /** One or two sentences shown as help text. */
  readonly description: string;
  /** Optional heading used to group related controls. */
  readonly group?: string;
}

export interface NumberParameter extends ParameterBase {
  /** `int` values must be whole numbers; `float` values may be fractional. */
  readonly type: 'int' | 'float';
  readonly default: number;
  readonly min: number;
  readonly max: number;
  /** Granularity of the UI control. */
  readonly step: number;
}

export interface BooleanParameter extends ParameterBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

export interface ChoiceParameter extends ParameterBase {
  readonly type: 'choice';
  readonly default: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export type ParameterDefinition = NumberParameter | BooleanParameter | ChoiceParameter;

export type ParameterValue = number | boolean | string;

/** Complete, validated parameter values keyed by parameter id. */
export type ParameterValues = Readonly<Record<string, ParameterValue>>;

/** A project the algorithm is taken from or based on. */
export interface SourceCredit {
  readonly project: string;
  readonly authors: string;
  readonly url: string;
  /** SPDX license identifier. */
  readonly license: string;
  /** Exact upstream revision the integrated code was taken from, if any. */
  readonly commit?: string;
  /** How this source relates to the integration. */
  readonly note?: string;
}

export interface RuntimeInfo {
  /** Where the algorithm executes, e.g. "JavaScript" or "Python (Pyodide)". */
  readonly label: string;
  /** One-time costs worth telling the user about, such as downloads. */
  readonly note?: string;
}

export interface AlgorithmInfo {
  /** Stable, unique, URL-safe identifier. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Upstream sources; the first entry is the direct origin of the code. */
  readonly sources: readonly SourceCredit[];
  /** How this integration differs from upstream, if at all. */
  readonly adaptationNotes?: string;
  readonly runtime: RuntimeInfo;
  readonly parameters: readonly ParameterDefinition[];
  /**
   * Re-run automatically whenever a parameter changes. Only suitable for
   * algorithms that finish in well under a second.
   */
  readonly liveUpdate?: boolean;
}

export interface RunContext {
  /** Reports a short, user-facing status message. */
  readonly onProgress: (message: string) => void;
  /** Aborted when the user cancels; implementations should stop promptly. */
  readonly signal: AbortSignal;
}

export interface AlgorithmResult {
  /** Standalone SVG document with `width`, `height` and `viewBox` set. */
  readonly svg: string;
  /** Optional summary shown with the preview. */
  readonly stats?: { readonly strokes: number; readonly points: number };
}

export interface Algorithm extends AlgorithmInfo {
  /**
   * Optionally loads expensive runtime resources ahead of `run`, e.g. when
   * the algorithm is selected. Must be idempotent; `run` must work without it.
   */
  prepare?(params: ParameterValues, context: RunContext): Promise<void>;
  /**
   * Draws `image`. `params` contains a valid value for every declared
   * parameter. Throws `AlgorithmError` for problems the user can act on.
   */
  run(image: RasterImage, params: ParameterValues, context: RunContext): Promise<AlgorithmResult>;
}

/** An error whose message is meant to be shown to the user. */
export class AlgorithmError extends Error {
  override readonly name = 'AlgorithmError';
  /** Technical detail such as a Python traceback, shown on request. */
  readonly details: string | undefined;

  constructor(message: string, options: { cause?: unknown; details?: string } = {}) {
    super(message, { cause: options.cause });
    this.details = options.details;
  }
}
