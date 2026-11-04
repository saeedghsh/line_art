// Web Worker hosting Pyodide, so Python never blocks the page. Requests are
// handled one at a time; PyodideWorkerRunner is the main-thread side.
import type { loadPyodide } from 'pyodide';
import type { SerializedError, WorkerRequest, WorkerResponse } from './protocol';
import { PythonCallError, PythonSession } from './python';

// Loaded from the CDN at the exact version pinned in package.json rather than
// bundled, which keeps the site small and lets browsers share the cache.
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${__PYODIDE_VERSION__}/full/`;

let session: Promise<PythonSession> | undefined;
let queue = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  queue = queue.then(() => handle(request));
});

async function handle(request: WorkerRequest): Promise<void> {
  const post = (response: WorkerResponse) => {
    self.postMessage(response);
  };
  const onOutput = (message: string) => {
    post({ id: request.id, type: 'output', message });
  };
  try {
    const python = await startSession(onOutput);
    if (request.type === 'load') {
      await python.loadPackages(request.packages, onOutput);
      post({ id: request.id, type: 'result', value: undefined });
    } else {
      post({ id: request.id, type: 'result', value: await python.call(request.call, onOutput) });
    }
  } catch (error) {
    post({ id: request.id, type: 'error', error: serialize(error) });
  }
}

function startSession(onOutput: (message: string) => void): Promise<PythonSession> {
  if (!session) {
    onOutput('Downloading the Python runtime…');
    const starting = import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`).then(
      async (module: { loadPyodide: typeof loadPyodide }) =>
        new PythonSession(await module.loadPyodide({ indexURL: INDEX_URL })),
    );
    // Allow a retry after a failed start, e.g. when offline.
    starting.catch(() => {
      session = undefined;
    });
    session = starting;
  }
  return session;
}

function serialize(error: unknown): SerializedError {
  if (error instanceof PythonCallError) {
    return {
      message: error.message,
      python: { type: error.pythonType, traceback: error.traceback },
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
