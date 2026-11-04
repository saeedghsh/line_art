import { beforeAll, describe, expect, it } from 'vitest';
import {
  PythonCallError,
  type PythonCall,
  type PythonRunner,
} from '../../src/runtimes/pyodide/python';
import { noSignal, nodePythonRunner } from '../helpers/node-python';

const SOURCES = {
  directory: '/home/pyodide/session-test',
  files: {
    'session_test.py': `
from PIL import Image


def describe(data, width, flag, name):
    print("first line")
    print("second line")
    return {"kind": type(data).__name__, "bytes": list(bytes(data)), "width": width,
            "flag": flag, "name": name, "pair": [1, 2.5]}


def fail():
    raise ValueError("input was rejected")


def pillow_version():
    return Image.__version__
`,
  },
};

const call = (fn: string, kwargs: Record<string, unknown> = {}): PythonCall => ({
  packages: ['pillow'],
  sources: SOURCES,
  module: 'session_test',
  function: fn,
  kwargs,
});

describe('PythonSession under Node', { timeout: 120_000 }, () => {
  let python: PythonRunner;
  beforeAll(async () => {
    python = await nodePythonRunner();
  }, 120_000);

  it('calls a function with keyword arguments and converts the result', async () => {
    const result = await python.call(
      call('describe', {
        data: new Uint8ClampedArray([1, 2, 255]),
        width: 3,
        flag: true,
        name: 'x',
      }),
      { onOutput: () => undefined, signal: noSignal },
    );
    expect(result).toEqual({
      kind: 'memoryview',
      bytes: [1, 2, 255],
      width: 3,
      flag: true,
      name: 'x',
      pair: [1, 2.5],
    });
  });

  it('forwards printed lines in order', async () => {
    const lines: string[] = [];
    await python.call(
      call('describe', { data: new Uint8Array(0), width: 0, flag: false, name: '' }),
      {
        onOutput: (line) => lines.push(line),
        signal: noSignal,
      },
    );
    expect(lines).toEqual(['first line', 'second line']);
  });

  it('turns Python exceptions into PythonCallError with a traceback', async () => {
    const error: unknown = await python
      .call(call('fail'), { onOutput: () => undefined, signal: noSignal })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PythonCallError);
    expect(error).toMatchObject({
      pythonType: 'ValueError',
      message: 'ValueError: input was rejected',
    });
    expect((error as PythonCallError).traceback).toContain('Traceback');
  });

  it('loads the requested packages', async () => {
    const version = await python.call(call('pillow_version'), {
      onOutput: () => undefined,
      signal: noSignal,
    });
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects attributes that are not functions', async () => {
    await expect(
      python.call(call('Image'), { onOutput: () => undefined, signal: noSignal }),
    ).rejects.toThrow(/not a Python function/);
  });
});
