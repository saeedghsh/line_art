# Adding a drawing algorithm

An algorithm is a plain object implementing the `Algorithm` interface in
[`src/algorithms/types.ts`](../src/algorithms/types.ts). The UI, parameter
controls, credits, previews and downloads are generated from it, so adding one
takes three steps:

1. Write an adapter in `src/algorithms/<id>/index.ts`.
2. Declare its metadata and parameters there.
3. Add it to the list in [`src/algorithms/registry.ts`](../src/algorithms/registry.ts).

No other application code needs to change.

## The contract

```ts
interface Algorithm {
  id: string; // unique, lowercase, URL-safe, e.g. 'stipple'
  name: string;
  description: string; // one or two sentences for the UI
  sources: SourceCredit[]; // upstream project(s): authors, url, license, commit
  adaptationNotes?: string; // how this integration differs from upstream
  runtime: { label: string; note?: string }; // e.g. 'JavaScript'; note one-time downloads
  parameters: ParameterDefinition[];
  liveUpdate?: boolean; // redraw on every parameter change (fast algorithms only)
  prepare?(params, context): Promise<void>; // optional, idempotent runtime preloading
  run(image, params, context): Promise<AlgorithmResult>;
}
```

`run` receives:

- `image`: a `RasterImage`, i.e. `{ width, height, data }` with opaque 8-bit
  RGBA pixels (like `ImageData`). Transparency is already flattened onto white
  and the longest side is at most 4096 px.
- `params`: a value for every declared parameter, already validated against
  its definition (type, range, options). Read them with `numberParam`,
  `booleanParam` and `choiceParam` from
  [`parameters.ts`](../src/algorithms/parameters.ts).
- `context.onProgress(message)` for short status messages, and
  `context.signal`, an `AbortSignal` that fires when the user cancels.

It returns `{ svg, stats? }`: a standalone SVG document with `width`, `height`
and `viewBox` set, plus optional `{ strokes, points }` counts shown with the
preview. Throw `AlgorithmError` (optionally with `details`, such as a
traceback) for problems the user should see; other errors are reported as
unexpected.

## Parameters

Each parameter has an `id`, `label`, `description` (help text) and optional
`group` heading, plus one of these shapes:

```ts
{ type: 'int' | 'float', default, min, max, step } // slider and number box
{ type: 'boolean', default }                       // checkbox
{ type: 'choice', default, options: [{ value, label }] } // segmented buttons
```

Keep the upstream names, defaults and ranges where possible, and say in the
description when a value is slow.

## A JavaScript algorithm

Keep the algorithm itself in its own module, separate from the adapter, so it
can be compared with upstream in tests:

```ts
// src/algorithms/stipple/index.ts
import { numberParam } from '../parameters';
import type { Algorithm } from '../types';
import { stipple, toSvg } from './stipple'; // the ported algorithm

export const stippleAlgorithm: Algorithm = {
  id: 'stipple',
  name: 'Stipple',
  description: 'Places dots more densely in darker areas.',
  sources: [
    {
      project: 'stipple-upstream',
      authors: 'Jane Doe',
      url: 'https://github.com/example/stipple',
      license: 'MIT',
      commit: '0123456789abcdef0123456789abcdef01234567',
    },
  ],
  runtime: { label: 'JavaScript' },
  liveUpdate: true,
  parameters: [
    {
      id: 'dots',
      label: 'Dots',
      description: 'Number of dots.',
      type: 'int',
      default: 2000,
      min: 100,
      max: 20000,
      step: 100,
    },
  ],
  run(image, params) {
    const dots = stipple(image, numberParam(params, 'dots'));
    return Promise.resolve({
      svg: toSvg(dots, image),
      stats: { strokes: dots.length, points: dots.length },
    });
  },
};
```

Then register it:

```ts
// src/algorithms/registry.ts
export const algorithms: readonly Algorithm[] = [
  squigglecam,
  createLinedraw(new PyodideWorkerRunner()),
  stippleAlgorithm,
];
```

Algorithms that run for more than a fraction of a second should not block the
page: run them in a Web Worker and honour `context.signal`.

## A Python algorithm

Python code runs unmodified in Pyodide through the shared runtime in
[`src/runtimes/pyodide/`](../src/runtimes/pyodide/); see
[`src/algorithms/linedraw/`](../src/algorithms/linedraw/) for a complete
example.

1. Vendor the upstream files unchanged in `src/algorithms/<id>/upstream/`,
   with their license and a short README naming the source commit.
2. Write a small wrapper module next to them, e.g. `<id>_web.py`, with a
   function that takes the pixels (`rgba` arrives as a `memoryview`, plus
   `width` and `height`) and keyword settings, and returns a plain `dict`.
   Keep file-system and browser concerns here, not in the upstream code.
3. In the adapter, import the sources with Vite's `?raw` suffix and call the
   wrapper through a `PythonRunner`:

   ```ts
   const result = await python.call(
     {
       packages: ['pillow'], // Pyodide packages, loaded on first use
       sources: { directory: '/home/pyodide/<id>', files: { '<id>_web.py': wrapper /* , ... */ } },
       module: '<id>_web',
       function: 'render',
       kwargs: { rgba: image.data, width: image.width, height: image.height /* , settings */ },
     },
     { onOutput: context.onProgress, signal: context.signal },
   );
   ```

   Anything the Python code prints is shown as progress. A Python exception
   arrives as `PythonCallError` with the traceback; convert it to an
   `AlgorithmError`. Implement `prepare` with `python.loadPackages(...)` so the
   runtime starts loading when the algorithm is selected.

4. Export a factory taking the runner, like `createLinedraw(python)`, and
   register it with `new PyodideWorkerRunner()`. Each runner owns its own
   worker, so Python algorithms do not share module names or state. Tests pass
   a Node-based runner instead (`tests/helpers/node-python.ts`).
5. Add the upstream packages to the pinned Python environment in
   `pyproject.toml` (matching the Pyodide release) for native tests.

## Tests

- [`tests/unit/registry.test.ts`](../tests/unit/registry.test.ts) checks every
  registered algorithm's metadata and parameter defaults automatically.
- Add `tests/unit/<id>.test.ts` covering valid output on a generated image
  (see [`tests/helpers/images.ts`](../tests/helpers/images.ts)), the effect of
  key parameters, boundary values and controlled errors. Use
  `runAlgorithm()` from [`run.ts`](../src/algorithms/run.ts), which applies
  the same validation as the app.
- Compare with upstream wherever possible: run the original code on the same
  input, or keep a verbatim excerpt under `tests/reference/` (see
  SquiggleCam) and require identical output, documenting any deliberate
  differences.
- Extend [`tests/e2e/smoke.spec.ts`](../tests/e2e/smoke.spec.ts) if the
  algorithm needs a new runtime.

## Attribution checklist

- Keep the upstream license file next to the copied code.
- Add a section to [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) with
  the source, commit, license text and every modification.
- Fill in `sources` (and `adaptationNotes` if anything differs); the About
  section of the site is generated from them.
- Credit the authors in the README's algorithm table.
