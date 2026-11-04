import {
  AlgorithmError,
  type ParameterDefinition,
  type ParameterValue,
  type ParameterValues,
} from './types';

export function defaultParameters(definitions: readonly ParameterDefinition[]): ParameterValues {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition.default]));
}

/**
 * Returns a complete set of values: missing entries take their defaults, and
 * unknown ids or invalid values are rejected with an `AlgorithmError`.
 */
export function resolveParameters(
  definitions: readonly ParameterDefinition[],
  values: Readonly<Record<string, unknown>>,
): ParameterValues {
  const known = new Set(definitions.map((definition) => definition.id));
  const unknown = Object.keys(values).filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new AlgorithmError(`Unknown parameter(s): ${unknown.join(', ')}.`);
  }
  return Object.fromEntries(
    definitions.map((definition) => {
      const value = values[definition.id];
      return [definition.id, value === undefined ? definition.default : check(definition, value)];
    }),
  );
}

function check(definition: ParameterDefinition, value: unknown): ParameterValue {
  const invalid = (expected: string) =>
    new AlgorithmError(`"${definition.label}" must be ${expected}; got ${JSON.stringify(value)}.`);

  switch (definition.type) {
    case 'int':
    case 'float': {
      const { min, max } = definition;
      const kind = definition.type === 'int' ? 'a whole number' : 'a number';
      if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(kind);
      if (definition.type === 'int' && !Number.isInteger(value)) throw invalid(kind);
      if (value < min || value > max) throw invalid(`between ${min} and ${max}`);
      return value;
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw invalid('true or false');
      return value;
    case 'choice': {
      const options = definition.options.map((option) => option.value);
      if (typeof value !== 'string' || !options.includes(value)) {
        throw invalid(`one of ${options.join(', ')}`);
      }
      return value;
    }
  }
}

// Typed accessors for adapters reading values that `resolveParameters`
// has already validated against their definitions.

export function numberParam(values: ParameterValues, id: string): number {
  return expectType(values, id, 'number');
}

export function booleanParam(values: ParameterValues, id: string): boolean {
  return expectType(values, id, 'boolean');
}

export function choiceParam(values: ParameterValues, id: string): string {
  return expectType(values, id, 'string');
}

function expectType<T extends 'number' | 'boolean' | 'string'>(
  values: ParameterValues,
  id: string,
  type: T,
): { number: number; boolean: boolean; string: string }[T] {
  const value = values[id];
  if (typeof value !== type) {
    throw new TypeError(`Parameter "${id}" is ${typeof value}, expected ${type}.`);
  }
  return value as { number: number; boolean: boolean; string: string }[T];
}
