import { describe, expect, it } from 'vitest';
import {
  booleanParam,
  choiceParam,
  defaultParameters,
  numberParam,
  resolveParameters,
} from '../../src/algorithms/parameters';
import { AlgorithmError, type ParameterDefinition } from '../../src/algorithms/types';

const definitions: ParameterDefinition[] = [
  {
    id: 'count',
    label: 'Count',
    description: '',
    type: 'int',
    default: 5,
    min: 1,
    max: 10,
    step: 1,
  },
  {
    id: 'gain',
    label: 'Gain',
    description: '',
    type: 'float',
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  { id: 'flag', label: 'Flag', description: '', type: 'boolean', default: true },
  {
    id: 'mode',
    label: 'Mode',
    description: '',
    type: 'choice',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  },
];

describe('defaultParameters', () => {
  it('collects every default', () => {
    expect(defaultParameters(definitions)).toEqual({ count: 5, gain: 1, flag: true, mode: 'a' });
  });
});

describe('resolveParameters', () => {
  it('fills missing values with defaults', () => {
    expect(resolveParameters(definitions, { count: 7 })).toEqual({
      count: 7,
      gain: 1,
      flag: true,
      mode: 'a',
    });
  });

  it('accepts values on the inclusive boundaries', () => {
    expect(resolveParameters(definitions, { count: 1, gain: 2 })).toMatchObject({
      count: 1,
      gain: 2,
    });
    expect(resolveParameters(definitions, { count: 10, gain: 0.5 })).toMatchObject({
      count: 10,
      gain: 0.5,
    });
  });

  it.each([
    [{ count: 0 }, /between 1 and 10/],
    [{ count: 11 }, /between 1 and 10/],
    [{ count: 2.5 }, /whole number/],
    [{ count: '3' }, /whole number/],
    [{ gain: Number.NaN }, /a number/],
    [{ gain: Number.POSITIVE_INFINITY }, /a number/],
    [{ flag: 'yes' }, /true or false/],
    [{ mode: 'c' }, /one of a, b/],
    [{ colour: 'red' }, /Unknown parameter\(s\): colour/],
  ])('rejects %j', (values, message) => {
    expect(() => resolveParameters(definitions, values)).toThrow(AlgorithmError);
    expect(() => resolveParameters(definitions, values)).toThrow(message);
  });
});

describe('typed accessors', () => {
  const values = resolveParameters(definitions, {});

  it('return values of the expected type', () => {
    expect(numberParam(values, 'count')).toBe(5);
    expect(booleanParam(values, 'flag')).toBe(true);
    expect(choiceParam(values, 'mode')).toBe('a');
  });

  it('fail loudly on a type mismatch, which indicates an adapter bug', () => {
    expect(() => numberParam(values, 'mode')).toThrow(TypeError);
    expect(() => booleanParam(values, 'missing')).toThrow(TypeError);
  });
});
