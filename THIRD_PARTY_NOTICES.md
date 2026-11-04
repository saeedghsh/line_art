# Third-party notices

Line Art Playground is released under the MIT License (see [LICENSE](LICENSE)).
It incorporates code from the projects listed below, which remain under their
own licenses and copyright notices. Their authors are credited here and in the
application; they are not affiliated with this project and do not endorse or
maintain it.

## linedraw

- Source: <https://github.com/LingDong-/linedraw>
- Commit: `3aedc2f61d0ef3a3eb2e1ba18b933cbcd95a44ad`
- Author: Lingdong Huang
- License: MIT (full text below; also in
  [`src/algorithms/linedraw/upstream/LICENSE`](src/algorithms/linedraw/upstream/LICENSE))
- Used in: [`src/algorithms/linedraw/upstream/`](src/algorithms/linedraw/upstream/)
  contains `linedraw.py`, `filters.py`, `strokesort.py`, `perlin.py` and
  `util.py`, unmodified. They run in the browser with Pyodide.

Modifications: none to the upstream files. The integration code in
[`src/algorithms/linedraw/linedraw_web.py`](src/algorithms/linedraw/linedraw_web.py),
which is this project's own, differs from running `linedraw.py` as follows:

1. Input and output: instead of reading an image file and writing
   `output/out.svg`, it takes pixels decoded by the browser and returns the SVG.
   The steps of upstream `sketch()` are reproduced with explicit settings
   instead of module globals; the bitmap preview (`-b`) is not available.
2. SVG size: upstream `makesvg()` output has no `width`, `height` or `viewBox`,
   which browsers need. These attributes are added to the root element, sized
   to the image area plus any strokes the hand-drawn jitter moves beyond it.
   The polylines are unchanged.
3. Seeding: the Perlin noise table is seeded from a user-visible seed, where
   upstream draws a new random seed per process, so results are reproducible.
4. Empty results: a blank image, or both contours and hatching disabled,
   yields an empty drawing where upstream `sortlines()` raises `IndexError`.
5. Options: the processing resolution, a module constant of 1024 upstream, can
   be lowered to 256. Hatch sizes below 8 and contour simplification above 4
   are not offered, and processing heights above 4096 pixels are rejected,
   because run time grows quadratically.

[`tests/python/test_linedraw_web.py`](tests/python/test_linedraw_web.py) and
[`tests/unit/linedraw.test.ts`](tests/unit/linedraw.test.ts) check that the
SVGs produced natively with CPython and in Pyodide match those written by
unmodified upstream `linedraw.py` exactly, polyline for polyline.

```text
MIT License

Copyright (c) 2017 Lingdong Huang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## SquiggleCam

- Source: <https://github.com/msurguy/SquiggleCam>
- Commit: `b33aab5c6e5b5176853245c67f18b0e862f252f0`
- Author: Maksim Surguy
- License: MIT (full text below; also in
  [`src/algorithms/squigglecam/LICENSE`](src/algorithms/squigglecam/LICENSE))
- Used in:
  - [`src/algorithms/squigglecam/squiggle.ts`](src/algorithms/squigglecam/squiggle.ts):
    TypeScript port of the line generation (`processImage()` in `src/App.vue`)
    and SVG serialisation (`src/components/svgChartLine.vue`,
    `src/components/svgChart.vue`).
  - [`tests/reference/squigglecam/upstream.js`](tests/reference/squigglecam/upstream.js):
    verbatim excerpts, used only by tests to compare the port with upstream.

Modifications:

1. Only the algorithm was ported. The Vue 2 application, `vue-worker`,
   `vue-croppa`, the webcam component and the Webpack 3 build are not used.
2. Brightness is computed from the R, G and B channels of the sampled pixel.
   Upstream read `data[4 * (index + 1)]` and `data[4 * (index + 2)]`, i.e. the
   red channel of the next two pixels, contrary to its documented algorithm,
   and past the end of the pixel buffer on the last row. Results are unchanged
   for images whose colour does not vary across neighbouring pixels.
3. The vertical line spacing is at least one pixel. Upstream's
   `Math.floor(height / lineCount)` is zero, an endless loop, for images
   shorter than the line count (impossible with its fixed paper sizes).
4. Input handling: the whole image is scaled to the selected width, keeping its
   aspect ratio, instead of being cropped to a fixed paper size with
   `vue-croppa`. The width range is 200–1000 px (upstream 200–500 px) and the
   sampling control uses steps of 0.1 (upstream 0.2 starting at 0.5, which made
   its default of 1 unreachable).
5. Stroke colour and width are set once on an SVG group rather than as an
   inline style on every path. Path geometry and number formatting are
   unchanged.

[`tests/unit/squigglecam.test.ts`](tests/unit/squigglecam.test.ts) checks that
the port reproduces upstream's output exactly where modification 2 does not
apply, and documents its effect where it does.

```text
MIT License

Copyright (c) 2019 Maksim Surguy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### SquiggleDraw

SquiggleCam implements the SquiggleDraw algorithm by Gregg Wygonik
(<https://github.com/gwygonik/SquiggleDraw>), which is released into the public
domain under the Unlicense. No SquiggleDraw code is included in this project.

## Runtime dependencies loaded from a CDN

The following are not part of this repository or its build output. The browser
downloads them from <https://cdn.jsdelivr.net/pyodide/> at the version pinned
in `package.json`, only when a Python-based algorithm is used.

- [Pyodide](https://pyodide.org) 314.0.7, the CPython interpreter compiled to
  WebAssembly, with its standard library: Mozilla Public License 2.0; CPython
  is under the Python Software Foundation License.
- [Pillow](https://python-pillow.org) 12.2.0: MIT-CMU License.
- [NumPy](https://numpy.org) 2.4.6: BSD 3-Clause License; only with OpenCV
  edge detection.
- [OpenCV](https://opencv.org) 4.11.0 (`opencv-python`): Apache License 2.0;
  only with OpenCV edge detection.
