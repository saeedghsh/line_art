// Types for the verbatim upstream excerpts in upstream.js.

export interface UpstreamConfig {
  width: number;
  height: number;
  contrast: number;
  brightness: number;
  lineCount: number;
  minBrightness: number;
  maxBrightness: number;
  spacing: number;
  amplitude: number;
  frequency: number;
  black: boolean;
}

export function processImage(data: {
  config: UpstreamConfig;
  image: { data: ArrayLike<number> };
}): [number, number][][];

export const svgChartLine: {
  pathD(this: { d: { values: readonly (readonly [number, number])[] } }): string;
};
