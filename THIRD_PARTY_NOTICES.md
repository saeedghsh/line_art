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
  `util.py`, unmodified.

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
