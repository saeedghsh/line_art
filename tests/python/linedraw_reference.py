"""Reference outputs of upstream linedraw, shared by the Python and JS tests.

Running this module regenerates ``tests/fixtures/linedraw/``: a synthetic input
image, the SVG that pristine upstream ``linedraw.sketch()`` writes for each case
in ``cases.json``, and the package versions used. The browser tests compare the
Pyodide build against these files, so regenerate them (``npm run
fixtures:linedraw``) whenever the Pyodide version and its pinned packages change.
"""

import hashlib
import importlib.metadata
import json
import random
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
LINEDRAW_DIR = ROOT / "src" / "algorithms" / "linedraw"
UPSTREAM_DIR = LINEDRAW_DIR / "upstream"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "linedraw"
INPUT_IMAGE = FIXTURE_DIR / "input.png"

for path in (LINEDRAW_DIR, UPSTREAM_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import linedraw_web  # noqa: E402

# Pyodide package name -> PyPI distribution installed natively.
PACKAGES = {"pillow": "pillow", "numpy": "numpy", "opencv-python": "opencv-python-headless"}


def load_cases() -> dict[str, dict]:
    """Return the cases keyed by name; params use the TypeScript adapter's ids."""
    cases = json.loads((FIXTURE_DIR / "cases.json").read_text(encoding="utf-8"))
    return {case["name"]: case["params"] for case in cases}


def settings_from_params(params: dict) -> linedraw_web.Settings:
    """Translate adapter parameters into wrapper settings (defaults included)."""
    names = {
        "resolution": "resolution",
        "drawContours": "draw_contours",
        "drawHatch": "draw_hatch",
        "hatchSize": "hatch_size",
        "contourSimplify": "contour_simplify",
        "seed": "seed",
    }
    options = {names[key]: value for key, value in params.items() if key != "edgeDetection"}
    use_opencv = params.get("edgeDetection", "opencv") == "opencv"
    return linedraw_web.Settings(**options, use_opencv=use_opencv)


def upstream_svg(image_path: Path, settings: linedraw_web.Settings, export_path: Path) -> str:
    """Run upstream ``linedraw.sketch()`` as its command line would, seeded."""
    import linedraw
    import perlin

    linedraw.no_cv = not settings.use_opencv
    linedraw.export_path = str(export_path)
    linedraw.resolution = settings.resolution
    linedraw.draw_contours = settings.draw_contours
    linedraw.draw_hatch = settings.draw_hatch
    linedraw.hatch_size = settings.hatch_size
    linedraw.contour_simplify = settings.contour_simplify
    linedraw.show_bitmap = False
    random.seed(settings.seed)
    perlin.perlin = None
    linedraw.sketch(str(image_path))
    return export_path.read_text(encoding="utf-8")


def svg_body(svg: str) -> str:
    """Return everything after the root element's start tag."""
    return svg.split(">", 1)[1]


def polylines(svg: str) -> list[list[tuple[float, float]]]:
    result = []
    for points in re.findall(r'points="([^"]*)"', svg):
        values = [float(v) for v in points.split(",")]
        result.append(list(zip(values[::2], values[1::2], strict=True)))
    return result


def installed_versions() -> dict[str, str]:
    return {name: importlib.metadata.version(dist) for name, dist in PACKAGES.items()}


def git_blob_sha1(path: Path) -> str:
    """Hash a file the way ``git hash-object`` does."""
    data = path.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def make_input_image() -> Image.Image:
    """Draw a small, deterministic test scene with gradients, shapes and colour."""
    image = Image.new("RGB", (240, 180))
    draw = ImageDraw.Draw(image)
    for y in range(180):
        shade = 235 - y // 3
        draw.line([(0, y), (239, y)], fill=(shade, shade, 255 - y // 4))
    for i, radius in enumerate(range(60, 0, -6)):
        level = 40 + 14 * i
        draw.ellipse(
            [150 - radius, 80 - radius, 150 + radius, 80 + radius], fill=(level, level, level)
        )
    draw.rectangle([20, 100, 90, 160], fill=(200, 40, 40))
    draw.polygon([(30, 20), (110, 30), (70, 85)], fill=(20, 110, 30))
    draw.line([(0, 175), (239, 120)], fill=(10, 10, 10), width=5)
    return image


def generate() -> None:
    make_input_image().save(INPUT_IMAGE)
    for name, params in load_cases().items():
        target = FIXTURE_DIR / "expected" / f"{name}.svg"
        upstream_svg(INPUT_IMAGE, settings_from_params(params), target)
        print(f"wrote {target.relative_to(ROOT)}")
    versions = json.dumps(installed_versions(), indent=2) + "\n"
    (FIXTURE_DIR / "versions.json").write_text(versions, encoding="utf-8")


if __name__ == "__main__":
    generate()
