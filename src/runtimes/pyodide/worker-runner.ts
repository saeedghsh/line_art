import type { WorkerRequest, WorkerResponse } from './protocol';
import {
  PythonCallError,
  type PythonCall,
  type PythonRunOptions,
  type PythonRunner,
} from './python';

type RequestBody =
  | { readonly type: 'load'; readonly packages: readonly string[] }
  | { readonly type: 'call'; readonly call: PythonCall };

interface Pending {
  readonly onOutput: (line: string) => void;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly dispose: () => void;
}

/**
 * Runs Python in a dedicated Web Worker, started on first use and reused
 * afterwards. Cancelling terminates the worker, the only way to interrupt
 * running Python without cross-origin isolation (which GitHub Pages cannot
 * provide); the next request starts a fresh one.
 */
export class PyodideWorkerRunner implements PythonRunner {
  private worker: Worker | undefined;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  async loadPackages(packages: readonly string[], options: PythonRunOptions): Promise<void> {
    await this.request({ type: 'load', packages }, options);
  }

  call(call: PythonCall, options: PythonRunOptions): Promise<unknown> {
    return this.request({ type: 'call', call }, options);
  }

  private request(body: RequestBody, { onOutput, signal }: PythonRunOptions): Promise<unknown> {
    signal.throwIfAborted();
    const worker = this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.stop(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        onOutput,
        resolve,
        reject,
        dispose: () => {
          signal.removeEventListener('abort', onAbort);
        },
      });
      worker.postMessage({ id, ...body } satisfies WorkerRequest);
    });
  }

  private start(): Worker {
    if (!this.worker) {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'pyodide',
      });
      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        this.receive(event.data);
      });
      worker.addEventListener('error', (event) => {
        this.stop(new Error(`The Python worker failed: ${event.message || 'unknown error'}`));
      });
      this.worker = worker;
    }
    return this.worker;
  }

  private receive(response: WorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (response.type === 'output') {
      pending.onOutput(response.message);
      return;
    }
    this.pending.delete(response.id);
    pending.dispose();
    if (response.type === 'result') {
      pending.resolve(response.value);
    } else {
      const { message, python } = response.error;
      pending.reject(
        python ? new PythonCallError(python.type, python.traceback) : new Error(message),
      );
    }
  }

  /** Terminates the worker and rejects every outstanding request. */
  private stop(reason: unknown): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      pending.dispose();
      pending.reject(reason);
    }
    this.pending.clear();
  }
}
