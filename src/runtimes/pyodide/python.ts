import type { PyodideAPI } from 'pyodide';
import type { PyProxy } from 'pyodide/ffi';

/** Python modules to make importable, written into Pyodide's file system. */
export interface PythonSources {
  /** Absolute directory in the Pyodide file system; added to `sys.path`. */
  readonly directory: string;
  /** File name to source text. */
  readonly files: Readonly<Record<string, string>>;
}

/** A call of a Python function, as plain data that can be sent to a worker. */
export interface PythonCall {
  /** Pyodide packages to load first, e.g. `pillow`. */
  readonly packages: readonly string[];
  readonly sources: PythonSources;
  readonly module: string;
  readonly function: string;
  /** Keyword arguments. Typed arrays arrive in Python as `memoryview`. */
  readonly kwargs: Readonly<Record<string, unknown>>;
}

export interface PythonRunOptions {
  /** Receives Python's stdout/stderr and package-loading messages by line. */
  readonly onOutput: (line: string) => void;
  readonly signal: AbortSignal;
}

/**
 * Executes Python calls. The app uses a Web Worker (`PyodideWorkerRunner`);
 * tests drive a `PythonSession` directly under Node.
 */
export interface PythonRunner {
  loadPackages(packages: readonly string[], options: PythonRunOptions): Promise<void>;
  /** Resolves with the function's return value converted to JavaScript. */
  call(call: PythonCall, options: PythonRunOptions): Promise<unknown>;
}

/** A Python exception reduced to plain data, so it can leave a worker. */
export class PythonCallError extends Error {
  override readonly name = 'PythonCallError';

  constructor(
    /** Exception class name, e.g. `ValueError`. */
    readonly pythonType: string,
    readonly traceback: string,
  ) {
    super(traceback.trim().split('\n').at(-1) ?? pythonType);
  }
}

/** Runs `PythonCall`s on one Pyodide instance. Calls must not overlap. */
export class PythonSession {
  private output: (line: string) => void = () => undefined;
  private readonly installed = new Set<string>();

  constructor(private readonly pyodide: PyodideAPI) {
    const write = (line: string) => {
      this.output(line);
    };
    pyodide.setStdout({ batched: write });
    pyodide.setStderr({ batched: write });
  }

  async loadPackages(packages: readonly string[], onOutput: (line: string) => void): Promise<void> {
    // Skipping loaded packages avoids Pyodide's "already loaded" messages.
    const loaded = new Set(Object.keys(this.pyodide.loadedPackages).map(normalizePackageName));
    const missing = packages.filter((name) => !loaded.has(normalizePackageName(name)));
    if (missing.length === 0) return;
    await this.pyodide.loadPackage(missing, {
      messageCallback: onOutput,
      errorCallback: onOutput,
    });
  }

  async call(call: PythonCall, onOutput: (line: string) => void): Promise<unknown> {
    await this.loadPackages(call.packages, onOutput);
    this.install(call.sources);

    const { PyProxy, PythonError } = this.pyodide.ffi;
    const proxies: PyProxy[] = [];
    const kwargs = Object.fromEntries(
      Object.entries(call.kwargs).map(([name, value]) => {
        if (!ArrayBuffer.isView(value)) return [name, value];
        const proxy = this.pyodide.toPy(value) as PyProxy;
        proxies.push(proxy);
        return [name, proxy];
      }),
    );

    this.output = onOutput;
    try {
      const module = this.pyodide.pyimport(call.module) as PyProxy;
      proxies.push(module);
      const fn = module[call.function as keyof PyProxy] as unknown;
      if (!(fn instanceof this.pyodide.ffi.PyCallable)) {
        throw new Error(`${call.module}.${call.function} is not a Python function.`);
      }
      proxies.push(fn);
      const result = fn.callKwargs(kwargs) as unknown;
      if (!(result instanceof PyProxy)) return result;
      proxies.push(result);
      return result.toJs({
        dict_converter: Object.fromEntries,
        create_pyproxies: false,
      }) as unknown;
    } catch (error) {
      if (error instanceof PythonError) throw new PythonCallError(error.type, error.message);
      throw error;
    } finally {
      this.output = () => undefined;
      for (const proxy of proxies) proxy.destroy();
    }
  }

  private install({ directory, files }: PythonSources): void {
    if (this.installed.has(directory)) return;
    // Emscripten's file system; typed locally to avoid its global type package.
    const fs = this.pyodide.FS as {
      mkdirTree(path: string): void;
      writeFile(path: string, data: string): void;
    };
    fs.mkdirTree(directory);
    for (const [name, source] of Object.entries(files)) {
      fs.writeFile(`${directory}/${name}`, source);
    }
    const sys = this.pyodide.pyimport('sys') as PyProxy & {
      path: PyProxy & { insert(index: number, item: string): void };
    };
    sys.path.insert(0, directory);
    sys.destroy();
    this.installed.add(directory);
  }
}

/** PEP 503 normalisation; Pyodide reports e.g. `pillow` as `Pillow`. */
function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}
