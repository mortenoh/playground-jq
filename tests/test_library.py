from pathlib import Path

import pytest

from playground_jq.config import Settings
from playground_jq.content import library as library_module
from playground_jq.content.library import (
    ContentError,
    load_groups,
    load_library,
    load_starters,
    load_tutorials,
    parse_chapter,
)
from playground_jq.content.models import Check, InputSpec
from playground_jq.content.verify import Item, verify_item
from playground_jq.jq.diagnostics import compile_errors, plain_error
from playground_jq.jq.models import RunOptions
from playground_jq.sources.registry import Sources


def test_bad_yaml_and_bad_models_name_the_file(tmp_path: Path) -> None:
    (tmp_path / "10-bad.yaml").write_text("id: [unclosed")
    with pytest.raises(ContentError, match="10-bad.yaml"):
        load_groups(tmp_path)
    (tmp_path / "10-bad.yaml").write_text("id: x\ntitle: X\nexamples: [{id: e, title: E}]\n")
    with pytest.raises(ContentError, match="10-bad.yaml"):
        load_groups(tmp_path)
    tutorials = tmp_path / "tutorials"
    tutorials.mkdir()
    (tutorials / "101-01-x.yaml").write_text(
        "id: t\nlevel: 101\ntitle: T\nsummary: s\ninput: {ref: dhis2:system-info}\nsteps: []\n"
    )
    with pytest.raises(ContentError, match="static datasets only"):
        load_tutorials(tutorials)


def test_chapters_need_frontmatter_and_valid_snippets(tmp_path: Path) -> None:
    missing = tmp_path / "01-missing.md"
    missing.write_text("# no frontmatter")
    with pytest.raises(ContentError, match="frontmatter"):
        parse_chapter(missing)
    bad = tmp_path / "02-bad.md"
    bad.write_text("---\ntitle: T\nsummary: s\nlevel: 101\n---\n\n```jq-try\ninput: '1'\n```\n")
    with pytest.raises(ContentError, match="snippet 1"):
        parse_chapter(bad)
    good = tmp_path / "03-good.md"
    good.write_text(
        "---\ntitle: Good\nsummary: s\nlevel: 201\n---\n\nText.\n\n"
        "```jq-try\nprogram: '.'\nref: static:bookstore\n```\n"
    )
    chapter = parse_chapter(good)
    assert chapter.slug == "good"
    assert chapter.number == 3
    assert chapter.snippets[0].id == "good-1"
    assert chapter.snippets[0].input == InputSpec(ref="static:bookstore")
    assert "<!-- snippet:good-1 -->" in chapter.markdown


def test_duplicates_are_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    examples = tmp_path / "examples"
    examples.mkdir()
    for name in ("10-a.yaml", "11-b.yaml"):
        (examples / name).write_text(
            f"id: {name[3]}\ntitle: T\nexamples:\n"
            "  - id: same\n    title: S\n    program: '.'\n    input: {text: '1'}\n"
        )
    monkeypatch.setattr(library_module, "EXAMPLES_DIR", examples)
    monkeypatch.setattr(library_module, "load_groups", lambda: load_groups(examples))
    with pytest.raises(ContentError, match="used twice"):
        load_library()


def test_starters_file(tmp_path: Path) -> None:
    assert load_starters(tmp_path / "missing.yaml") == []
    broken = tmp_path / "starters.yaml"
    broken.write_text("starters:\n  - program: '.'\n")
    with pytest.raises(ContentError, match="starters.yaml"):
        load_starters(broken)


def test_input_spec_needs_exactly_one_side() -> None:
    with pytest.raises(ValueError):
        InputSpec()
    with pytest.raises(ValueError):
        InputSpec(ref="static:x", text="1")
    with pytest.raises(ValueError):
        _ = InputSpec(ref="nowhere:x").source


async def test_verify_item_edge_cases() -> None:
    settings = Settings(dhis2_enabled=False)
    sources = Sources(settings)
    item = Item(
        kind="example", id="x", program=".", input=InputSpec(ref="static:nope"), options=RunOptions(), check=Check()
    )
    skipped = await verify_item(item, sources, settings, live=True)
    assert skipped.status == "skip"
    failed = await verify_item(item, sources, settings)
    assert failed.status == "fail"
    assert "could not read the input" in failed.reason


def test_diagnostics_fallbacks() -> None:
    [error] = compile_errors("jq: error: something odd\njq: 1 compile error")
    assert error.message == "something odd"
    assert error.line is None
    assert plain_error("runtime", "jq: error (at <stdin>:3): boom").message == "boom"
