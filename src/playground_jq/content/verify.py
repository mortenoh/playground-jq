"""Running every piece of content and checking it produces what it says it does."""

import hashlib
import json
from collections import Counter
from typing import Any, Literal, cast

from pydantic import BaseModel, Field, JsonValue

from playground_jq.config import Settings
from playground_jq.content.library import Library
from playground_jq.content.models import Check, InputSpec
from playground_jq.jq.engine import run_program
from playground_jq.jq.models import RunOptions, RunResult
from playground_jq.sources.geojson import validate_geojson
from playground_jq.sources.registry import InputRef, Sources

#: What kind of content a verdict is about.
ItemKind = Literal["example", "tutorial", "snippet", "starter"]

#: pass: matches; drift: live values differ but the shape matches; fail: wrong or broken.
Status = Literal["pass", "drift", "fail", "skip"]


class Item(BaseModel):
    """One runnable piece of content."""

    kind: ItemKind
    id: str
    program: str
    input: InputSpec | None
    options: RunOptions
    check: Check
    cli_only: bool = False
    live_capable: bool = False


class Verdict(BaseModel):
    """What running one item showed."""

    kind: ItemKind
    id: str
    status: Status
    reason: str = ""
    engine: str | None = None
    outputs: list[JsonValue] = Field(default_factory=lambda: [])
    duration_ms: float = 0.0


def items(library: Library) -> list[Item]:
    """Every runnable piece of content: examples, tutorial solutions and guide snippets."""
    found: list[Item] = []
    for example in library.examples():
        found.append(
            Item(
                kind="example",
                id=example.id,
                program=example.program,
                input=example.input,
                options=example.options,
                check=Check.model_validate(example.model_dump(include=set(Check.model_fields))),
                live_capable=example.live and example.input.source in ("echo", "dhis2"),
            )
        )
    for tutorial in library.tutorials:
        for number, step in enumerate(tutorial.steps, start=1):
            found.append(
                Item(
                    kind="tutorial",
                    id=f"{tutorial.id}/{number}",
                    program=step.solution,
                    input=tutorial.input,
                    options=step.options,
                    check=Check.model_validate(step.model_dump(include=set(Check.model_fields))),
                )
            )
    for starter in library.starters:
        found.append(
            Item(
                kind="starter",
                id=f"starter:{starter.ref}",
                program=starter.program,
                input=InputSpec(ref=starter.ref),
                options=starter.options,
                check=Check.model_validate(starter.model_dump(include=set(Check.model_fields))),
                live_capable=not starter.ref.startswith("static:"),
            )
        )
    for chapter in library.chapters:
        for snippet in chapter.snippets:
            found.append(
                Item(
                    kind="snippet",
                    id=snippet.id,
                    program=snippet.program,
                    input=snippet.input,
                    options=snippet.options,
                    check=Check.model_validate(snippet.model_dump(include=set(Check.model_fields))),
                    cli_only=snippet.cli_only,
                )
            )
    return found


async def input_text(spec: InputSpec | None, sources: Sources, *, live: bool = False) -> str:
    """The text an input spec names."""
    if spec is None:
        return ""
    if spec.text is not None:
        return spec.text
    assert spec.ref is not None
    fetched = await sources.read(InputRef.parse(spec.ref), live=live)
    return fetched.text


async def run_item(item: Item, sources: Sources, settings: Settings, *, live: bool = False) -> RunResult:
    """Run one item over its input."""
    text = await input_text(item.input, sources, live=live)
    return await run_program(item.program, text, item.options, settings)


def judge(check: Check, result: RunResult) -> tuple[Status, str]:
    """Compare a run with what the content says it produces."""
    if check.error is not None:
        if result.ok:
            return "fail", f"expected an error containing {check.error!r}, the run succeeded"
        messages = " ".join(error.message for error in result.errors)
        if check.error not in messages:
            return "fail", f"expected an error containing {check.error!r}, got {messages!r}"
        if check.expected is not None and not _same(check.expected, result.outputs, unordered=check.unordered):
            return "fail", "the outputs before the error differ from expected"
        return "pass", ""
    if not result.ok:
        return "fail", "; ".join(f"{error.kind}: {error.message}" for error in result.errors)
    if result.truncated:
        return "fail", "the output was truncated by a limit"
    if check.expected is None and check.digest is None:
        return "fail", "no expected output is recorded (run `pjq content fill`)"
    if check.expected is not None and not _same(check.expected, result.outputs, unordered=check.unordered):
        return "fail", "the outputs differ from expected"
    if check.digest is not None and digest(result.outputs) != check.digest:
        return "fail", "the outputs differ from the recorded digest"
    if check.geojson:
        if len(result.outputs) != 1:
            return "fail", "a GeoJSON example produces exactly one output"
        report = validate_geojson(result.outputs[0])
        if not report.valid:
            return "fail", "the output is not valid GeoJSON: " + "; ".join(report.problems[:3])
    return "pass", ""


def judge_live(check: Check, result: RunResult) -> tuple[Status, str]:
    """Compare a live run: values drift, so a matching shape is enough."""
    status, reason = judge(check, result)
    if status == "pass" or not result.ok:
        return status, reason
    if check.expected is None:
        return "drift", "live values differ from the recorded digest"
    if [shape(value) for value in check.expected] == [shape(value) for value in result.outputs]:
        return "drift", "live values differ; the shape matches"
    if len(check.expected) != len(result.outputs):
        return "drift", f"live output count {len(result.outputs)} differs from {len(check.expected)}"
    return "fail", "the live output has a different shape"


async def verify_item(item: Item, sources: Sources, settings: Settings, *, live: bool = False) -> Verdict:
    """Run one item and judge it."""
    if live and not item.live_capable:
        return Verdict(kind=item.kind, id=item.id, status="skip", reason="not a live input")
    try:
        result = await run_item(item, sources, settings, live=live)
    except Exception as error:
        return Verdict(kind=item.kind, id=item.id, status="fail", reason=f"could not read the input: {error}")
    status, reason = judge_live(item.check, result) if live else judge(item.check, result)
    return Verdict(
        kind=item.kind,
        id=item.id,
        status=status,
        reason=reason,
        engine=result.engine,
        outputs=result.outputs,
        duration_ms=result.duration_ms,
    )


def shape(value: Any) -> Any:
    """The structure of a value with the values left out: types, keys, and the first element's shape."""
    if isinstance(value, dict):
        mapping = cast("dict[str, object]", value)
        return {key: shape(mapping[key]) for key in sorted(mapping)}
    if isinstance(value, list):
        items = cast("list[object]", value)
        return [shape(items[0])] if items else []
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if value is None:
        return "null"
    return "string"


def _same(expected: list[JsonValue], actual: list[JsonValue], *, unordered: bool) -> bool:
    """Whether two output lists are equal, as JSON."""
    if not unordered:
        return _canonical(expected) == _canonical(actual)
    return Counter(_canonical([item]) for item in expected) == Counter(_canonical([item]) for item in actual)


def _numbers(value: Any) -> Any:
    """A value with integral floats as integers: jq may print `24.0` or `24` for the same number."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        mapping = cast("dict[str, object]", value)
        return {key: _numbers(item) for key, item in mapping.items()}
    if isinstance(value, list):
        return [_numbers(item) for item in cast("list[object]", value)]
    return value


def _canonical(values: list[JsonValue]) -> str:
    return json.dumps(_numbers(values), sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(values: list[JsonValue]) -> str:
    """SHA-256 of the canonical JSON of a list of outputs."""
    return hashlib.sha256(_canonical(values).encode()).hexdigest()
