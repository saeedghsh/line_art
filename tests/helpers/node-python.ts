import { loadPyodide } from 'pyodide';
import { PythonSession, type PythonRunner } from '../../src/runtimes/pyodide/python';

/**
 * A `PythonRunner` that drives Pyodide directly under Node, using the same
 * `PythonSession` as the browser worker. Packages are downloaded from the
 * Pyodide CDN on first use and cached in node_modules/pyodide.
 */
export async function nodePythonRunner(): Promise<PythonRunner> {
  const session = new PythonSession(await loadPyodide());
  return {
    loadPackages: (packages, { onOutput }) => session.loadPackages(packages, onOutput),
    call: (call, { onOutput }) => session.call(call, onOutput),
  };
}

export const noSignal = new AbortController().signal;
