"""Run the vendored linedraw algorithm on in-memory pixels.

Upstream ``linedraw.sketch()`` opens an image file, draws it and writes an SVG
file, configured through module globals. ``sketch_image()`` performs the same
steps on a decoded image with explicit settings, and ``render()`` returns the
SVG to the caller. All drawing is done by the unmodified upstream functions in
``upstream/``.
"""

import contextlib
import dataclasses
import importlib
import io
import random
from types import ModuleType

from PIL import Image, ImageOps

import perlin

type Point = tuple[float, float]
type Polyline = list[Point]

_SVG_START = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">'


@dataclasses.dataclass(frozen=True)
class Settings:
    """Drawing options. Defaults are those of the upstream command line."""

    resolution: int = 1024
    draw_contours: bool = True
    draw_hatch: bool = True
    hatch_size: int = 16
    contour_simplify: int = 2
    use_opencv: bool = True
    seed: int = 0


def sketch_image(image: Image.Image, settings: Settings) -> list[Polyline]:
    """Return linedraw's polylines for ``image`` in plotting order.

    Mirrors the body of upstream ``linedraw.sketch()`` after the file is
    opened. The Perlin noise that makes strokes look hand-drawn is seeded
    from ``settings.seed``, where upstream uses a fresh random seed per run.
    """
    linedraw = _load_linedraw(settings.use_opencv)
    random.seed(settings.seed)
    perlin.perlin = None  # Rebuilt lazily from `random` on the next noise() call.

    w, h = image.size
    im = ImageOps.autocontrast(image.convert("L"), 10)
    res = settings.resolution
    lines = []
    if settings.draw_contours:
        cs = settings.contour_simplify
        lines += linedraw.getcontours(im.resize((res // cs, res // cs * h // w)), cs)
    if settings.draw_hatch:
        hs = settings.hatch_size
        lines += linedraw.hatch(im.resize((res // hs, res // hs * h // w)), hs)
    if not lines:
        return []  # Upstream's sortlines() fails on an empty list.
    return linedraw.sortlines(lines)


def to_svg(lines: list[Polyline], image_size: tuple[int, int], resolution: int) -> str:
    """Serialise ``lines`` with upstream ``makesvg()`` and give the SVG a size.

    ``makesvg()`` halves all coordinates but sets no width, height or viewBox,
    which browsers need to display the drawing. The viewBox spans the image
    area and any strokes that the hand-drawn jitter pushes beyond it.
    """
    w, h = image_size
    xs = [p[0] * 0.5 for line in lines for p in line]
    ys = [p[1] * 0.5 for line in lines for p in line]
    left, top = min([0.0, *xs]), min([0.0, *ys])
    right, bottom = max([resolution / 2, *xs]), max([resolution * h / w / 2, *ys])
    width, height = _number(right - left), _number(bottom - top)
    view_box = f"{_number(left)} {_number(top)} {width} {height}"

    svg = _load_linedraw(use_opencv=False).makesvg(lines)
    if not svg.startswith(_SVG_START):
        raise RuntimeError("Unexpected output from linedraw.makesvg()")
    return svg.replace(
        _SVG_START,
        f'{_SVG_START[:-1]} width="{width}" height="{height}" viewBox="{view_box}">',
        1,
    )


@dataclasses.dataclass(frozen=True)
class Drawing:
    svg: str
    strokes: int
    points: int


def draw(rgba: bytes | memoryview, width: int, height: int, settings: Settings) -> Drawing:
    """Draw an opaque RGBA image given as raw row-major pixels."""
    image = Image.frombuffer("RGBA", (width, height), rgba, "raw", "RGBA", 0, 1)
    lines = sketch_image(image, settings)
    return Drawing(
        svg=to_svg(lines, (width, height), settings.resolution),
        strokes=len(lines),
        points=sum(len(line) for line in lines),
    )


def render(rgba: bytes | memoryview, width: int, height: int, **options: int | bool) -> dict:
    """Entry point for JavaScript: ``draw()`` with ``Settings`` fields as keywords.

    Returns the ``Drawing`` as a dictionary, which Pyodide converts to a
    plain JavaScript object.
    """
    return dataclasses.asdict(draw(rgba, width, height, Settings(**options)))


def _load_linedraw(use_opencv: bool) -> ModuleType:
    """Import upstream linedraw, configured to use OpenCV or not.

    linedraw decides at import time whether OpenCV is available, so it is
    re-imported when OpenCV has been installed since. Its "Cannot import
    numpy/openCV" notice is suppressed because the caller chooses the mode.
    """
    with contextlib.redirect_stdout(io.StringIO()):
        linedraw = importlib.import_module("linedraw")
        if use_opencv and not hasattr(linedraw, "cv2"):
            linedraw = importlib.reload(linedraw)
    if use_opencv and not hasattr(linedraw, "cv2"):
        raise RuntimeError("OpenCV (cv2) is not installed")
    linedraw.no_cv = not use_opencv
    return linedraw


def _number(value: float) -> str:
    return f"{round(value, 2):g}"
