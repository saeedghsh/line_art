import { describe, expect, it } from 'vitest';
import { defaultParameters, resolveParameters } from '../../src/algorithms/parameters';
import { algorithms, findAlgorithm } from '../../src/algorithms/registry';

describe('registry', () => {
  it('lists algorithms with unique ids', () => {
    const ids = algorithms.map((algorithm) => algorithm.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds algorithms by id', () => {
    for (const algorithm of algorithms) expect(findAlgorithm(algorithm.id)).toBe(algorithm);
    expect(findAlgorithm('no-such-algorithm')).toBeUndefined();
  });
});

// Checks every registered algorithm, so new ones are covered automatically.
describe.each(algorithms.map((algorithm) => [algorithm.id, algorithm] as const))(
  'algorithm "%s"',
  (_, algorithm) => {
    it('has a URL-safe id and user-facing text', () => {
      expect(algorithm.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(algorithm.name.trim()).not.toBe('');
      expect(algorithm.description.trim()).not.toBe('');
      expect(algorithm.runtime.label.trim()).not.toBe('');
    });

    it('credits its sources with a license', () => {
      expect(algorithm.sources.length).toBeGreaterThan(0);
      for (const source of algorithm.sources) {
        expect(source.authors.trim()).not.toBe('');
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.license.trim()).not.toBe('');
      }
      expect(algorithm.sources[0]?.commit).toMatch(/^[0-9a-f]{40}$/);
    });

    it('declares parameters with unique ids and valid defaults', () => {
      const ids = algorithm.parameters.map((parameter) => parameter.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(resolveParameters(algorithm.parameters, {})).toEqual(
        defaultParameters(algorithm.parameters),
      );
      for (const parameter of algorithm.parameters) {
        expect(parameter.label.trim()).not.toBe('');
        expect(parameter.description.trim()).not.toBe('');
        if (parameter.type === 'int' || parameter.type === 'float') {
          expect(parameter.min).toBeLessThan(parameter.max);
          expect(parameter.step).toBeGreaterThan(0);
        }
        if (parameter.type === 'choice') {
          const values = parameter.options.map((option) => option.value);
          expect(new Set(values).size).toBe(values.length);
        }
      }
    });
  },
);
