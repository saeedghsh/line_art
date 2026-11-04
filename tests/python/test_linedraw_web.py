"""Tests for the browser entry point of linedraw against pristine upstream."""

import json
import re
from pathlib import Path

import pytest
from PIL import Image

import linedraw_reference as ref
import linedraw_web

CASES = ref.load_cases()

# Git blob hashes of the vendored files at upstream commit 3aedc2f6.
UPSTREAM_BLOBS = {
    "LICENSE": "b1cd7782ba7edea3bb97ba0afec85a90664f3aff",
    "filters.py": "fcc901b957b78ac784e69891f36fc42b968cf8ff",
    "linedraw.py": "467c27d3e04c4487b2477915c15f3ef934eb7d72",
    "perlin.py": "40e8263cbbd53b5536e1794ff1604987942bed7e",
    "strokesort.py": "748e6d5e1e7c66d316a8c987859e7d4ede8dbfe0",
    "util.py": "235c3ed960070caeb3ed4b049cfd82cf80a761f9",
}


def rgba(image: Image.Image) -> tuple[bytes, int, int]:
    rgba_image = image.convert("RGBA")
    return rgba_image.tobytes(), *rgba_image.size


def draw_fixture(settings: linedraw_web.Settings) -> linedraw_web.Drawing:
    with Image.open(ref.INPUT_IMAGE) as image:
        return linedraw_web.draw(*rgba(image), settings)


def test_vendored_files_are_unmodified() -> None:
    actual = {name: ref.git_blob_sha1(ref.UPSTREAM_DIR / name) for name in UPSTREAM_BLOBS}
    assert actual == UPSTREAM_BLOBS


def test_environment_matches_fixture_versions() -> None:
    recorded = json.loads((ref.FIXTURE_DIR / "versions.json").read_text(encoding="utf-8"))
    assert ref.installed_versions() == recorded


@pytest.mark.parametrize("name", CASES)
def test_expected_files_are_upstream_output(name: str, tmp_path: Path) -> None:
    settings = ref.settings_from_params(CASES[name])
    regenerated = ref.upstream_svg(ref.INPUT_IMAGE, settings, tmp_path / "out.svg")
    assert regenerated == (ref.FIXTURE_DIR / "expected" / f"{name}.svg").read_text(encoding="utf-8")


@pytest.mark.parametrize("name", CASES)
def test_draw_matches_upstream(name: str) -> None:
    drawing = draw_fixture(ref.settings_from_params(CASES[name]))
    expected = (ref.FIXTURE_DIR / "expected" / f"{name}.svg").read_text(encoding="utf-8")
    assert ref.svg_body(drawing.svg) == ref.svg_body(expected)
    lines = ref.polylines(expected)
    assert drawing.strokes == len(lines)
    assert drawing.points == sum(len(line) for line in lines)


def test_svg_is_sized_to_cover_image_and_strokes() -> None:
    drawing = draw_fixture(linedraw_web.Settings())
    match = re.search(r'width="([\d.]+)" height="([\d.]+)" viewBox="([-\d. ]+)"', drawing.svg)
    assert match
    left, top, width, height = (float(v) for v in match[3].split())
    assert (float(match[1]), float(match[2])) == (width, height)
    # The fixture is 240x180; makesvg() halves the 1024-wide drawing.
    assert left <= 0 and top <= 0
    assert left + width >= 512 and top + height >= 384
    for line in ref.polylines(drawing.svg):
        for x, y in line:
            assert left <= x <= left + width and top <= y <= top + height


def test_seed_makes_output_reproducible() -> None:
    first = draw_fixture(linedraw_web.Settings(seed=5))
    assert draw_fixture(linedraw_web.Settings(seed=5)) == first
    assert draw_fixture(linedraw_web.Settings(seed=6)).svg != first.svg


@pytest.mark.parametrize(
    "settings",
    [
        linedraw_web.Settings(),
        linedraw_web.Settings(draw_contours=False, draw_hatch=False),
    ],
)
def test_blank_or_disabled_drawing_is_empty_but_valid(settings: linedraw_web.Settings) -> None:
    blank = Image.new("RGB", (64, 48), "white")
    drawing = linedraw_web.draw(*rgba(blank), settings)
    assert (drawing.strokes, drawing.points) == (0, 0)
    assert drawing.svg.startswith("<svg ") and drawing.svg.endswith("</svg>")


def test_render_returns_plain_data_and_rejects_unknown_options() -> None:
    data, width, height = rgba(Image.new("RGB", (8, 8), "black"))
    result = linedraw_web.render(data, width, height, resolution=256, use_opencv=False)
    assert set(result) == {"svg", "strokes", "points"}
    with pytest.raises(TypeError):
        linedraw_web.render(data, width, height, colour="red")
