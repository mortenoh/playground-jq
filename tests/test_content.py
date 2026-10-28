"""Every example, tutorial solution and guide snippet produces what it says, against its snapshot."""

import shutil

import pytest

from playground_jq.config import Settings
from playground_jq.content.library import Library, cached_library
from playground_jq.content.models import Check
from playground_jq.content.verify import Item, items, judge, judge_live, shape, verify_item
from playground_jq.jq.models import RunResult
from playground_jq.sources.registry import Sources

ITEMS = items(cached_library())

#: These tests check outputs, not speed: a loaded machine running every test in parallel can push the
#: heaviest GeoJSON programs past the playground's 2 s limit. The browser suite (`make e2e`) runs every
#: item through the served app, where the real limit applies.
CONTENT_SETTINGS = Settings(jq_timeout_seconds=30.0, dhis2_enabled=False, ui_enabled=False)


@pytest.mark.parametrize("item", ITEMS, ids=[f"{item.kind}:{item.id}" for item in ITEMS])
async def test_content_item(item: Item, sources: Sources) -> None:
    if item.cli_only and shutil.which("jq") is None:
        pytest.skip("needs the jq binary")
    verdict = await verify_item(item, sources, CONTENT_SETTINGS)
    assert verdict.status == "pass", verdict.reason


def test_library_is_substantial(library: Library) -> None:
    assert len(library.examples()) >= 250
    assert len(library.builtins) >= 150


def test_every_example_links_somewhere(library: Library) -> None:
    for example in library.examples():
        assert example.manual or example.guide or example.explanation, example.id


def result(outputs: list[object], *, ok: bool = True, message: str = "") -> RunResult:
    errors = [] if ok else [{"kind": "runtime", "message": message}]
    return RunResult.model_validate(
        {
            "ok": ok,
            "engine": "library",
            "outputs": outputs,
            "text": "",
            "errors": errors,
            "duration_ms": 1,
            "command": "",
        }
    )


def test_judge() -> None:
    assert judge(Check(expected=[1]), result([1]))[0] == "pass"
    assert judge(Check(expected=[1]), result([2]))[0] == "fail"
    assert judge(Check(expected=[1, 2], unordered=True), result([2, 1]))[0] == "pass"
    assert judge(Check(), result([1]))[0] == "fail"
    assert judge(Check(error="boom"), result([], ok=False, message="it went boom"))[0] == "pass"
    assert judge(Check(error="boom"), result([1]))[0] == "fail"
    assert judge(Check(error="boom"), result([], ok=False, message="other"))[0] == "fail"
    assert judge(Check(expected=[1]), result([], ok=False, message="x"))[0] == "fail"
    assert judge(Check(expected=[{"type": "Point"}], geojson=True), result([{"type": "Point"}]))[0] == "fail"


def test_judge_live_accepts_drift_in_values_only() -> None:
    assert judge_live(Check(expected=[{"a": 1}]), result([{"a": 2}]))[0] == "drift"
    assert judge_live(Check(expected=[{"a": 1}]), result([{"b": 2}]))[0] == "fail"
    assert judge_live(Check(expected=[1]), result([1, 2]))[0] == "drift"
    assert judge_live(Check(digest="x"), result([1]))[0] == "drift"


def test_shape() -> None:
    assert shape({"b": [1, 2], "a": None, "c": True, "d": "x"}) == {
        "a": "null",
        "b": ["number"],
        "c": "boolean",
        "d": "string",
    }
    assert shape([]) == []
