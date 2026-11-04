import { squigglecam } from './squigglecam';
import type { Algorithm } from './types';

/** Every algorithm offered by the playground; the first one is the default. */
export const algorithms: readonly Algorithm[] = [squigglecam];

export function findAlgorithm(id: string): Algorithm | undefined {
  return algorithms.find((algorithm) => algorithm.id === id);
}
