// Messages between PyodideWorkerRunner (main thread) and worker.ts.
import type { PythonCall } from './python';

export type WorkerRequest =
  | { readonly id: number; readonly type: 'load'; readonly packages: readonly string[] }
  | { readonly id: number; readonly type: 'call'; readonly call: PythonCall };

export interface SerializedError {
  readonly message: string;
  /** Present for Python exceptions. */
  readonly python?: { readonly type: string; readonly traceback: string };
}

export type WorkerResponse =
  | { readonly id: number; readonly type: 'output'; readonly message: string }
  | { readonly id: number; readonly type: 'result'; readonly value: unknown }
  | { readonly id: number; readonly type: 'error'; readonly error: SerializedError };
