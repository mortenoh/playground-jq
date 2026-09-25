# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false
"""Recording expected outputs into content files from a run, keeping the files' formatting.

Authoring-only: needs `ruamel.yaml` from the dev group. Every filled value is printed so it
can be reviewed before it is committed; a run that fails is reported and nothing is written.
"""

import json
from pathlib import Path
from typing import Any

from pydantic import JsonValue

from playground_jq.config import Settings
from playground_jq.content.library import (
    EXAMPLES_DIR,
    GUIDE_DIR,
    SNIPPET_BLOCK,
    STARTERS_FILE,
    TUTORIALS_DIR,
    parse_chapter,
)
from playground_jq.content.models import InputSpec
from playground_jq.content.verify import digest, input_text
from playground_jq.jq.engine import run_program
from playground_jq.jq.models import RunOptions
from playground_jq.sources.registry import Sources

#: Outputs larger than this are recorded as a digest rather than inline.
INLINE_LIMIT_BYTES = 3_000


def _flow(value: Any) -> Any:
    """A value as ruamel nodes in flow style, so expected outputs stay on one line where they can."""
    from ruamel.yaml.comments import CommentedMap, CommentedSeq
    from ruamel.yaml.scalarstring import DoubleQuotedScalarString

    # Every string is double-quoted: the loader reads YAML 1.1, where a bare `yes` or `NO` is a
    # boolean, so an unquoted recorded string would come back as something else.
    if isinstance(value, str):
        return DoubleQuotedScalarString(value)
    if isinstance(value, dict):
        mapping = CommentedMap()
        for key, item in value.items():
            mapping[DoubleQuotedScalarString(key)] = _flow(item)
        mapping.fa.set_flow_style()
        return mapping
    if isinstance(value, list):
        sequence = CommentedSeq([_flow(item) for item in value])
        sequence.fa.set_flow_style()
        return sequence
    return value


def _preview(outputs: list[JsonValue]) -> str:
    text = json.dumps(outputs, ensure_ascii=False, separators=(",", ":"))
    return text if len(text) <= 160 else text[:157] + "..."


async def _outputs(
    program: str, spec: InputSpec | None, options: RunOptions, sources: Sources, settings: Settings
) -> tuple[list[JsonValue] | None, str]:
    """The outputs of a run, or None and the reason it failed."""
    result = await run_program(program, await input_text(spec, sources), options, settings)
    if not result.ok:
        return None, "; ".join(f"{error.kind}: {error.message}" for error in result.errors)
    if result.truncated:
        return None, "truncated"
    return result.outputs, ""


def _record(node: Any, outputs: list[JsonValue]) -> str:
    """Write expected (or a digest for large outputs) into a ruamel mapping; answer how it was recorded."""
    size = len(json.dumps(outputs, ensure_ascii=False).encode())
    node.pop("expected", None)
    node.pop("digest", None)
    if size > INLINE_LIMIT_BYTES:
        node["digest"] = digest(outputs)
        return f"digest ({size} bytes, {len(outputs)} outputs)"
    node["expected"] = _flow(outputs)
    return _preview(outputs)


async def fill(settings: Settings, *, prefix: str | None = None, overwrite: bool = False) -> list[str]:
    """Fill expected outputs in examples, tutorials and guide snippets that have none."""
    from ruamel.yaml import YAML

    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096
    yaml.indent(mapping=2, sequence=4, offset=2)
    sources = Sources(settings)
    report: list[str] = []

    def wanted(identifier: str, node: Any) -> bool:
        if prefix is not None and not identifier.startswith(prefix):
            return False
        if "error" in node:
            return False
        return overwrite or ("expected" not in node and "digest" not in node)

    for path in sorted(EXAMPLES_DIR.glob("*.yaml")):
        document = yaml.load(path)
        changed = False
        for node in document.get("examples", []):
            identifier = str(node["id"])
            if not wanted(identifier, node):
                continue
            spec = InputSpec.model_validate(dict(node["input"]))
            options = RunOptions.model_validate(json.loads(json.dumps(node.get("options", {}))))
            outputs, reason = await _outputs(str(node["program"]), spec, options, sources, settings)
            if outputs is None:
                report.append(f"FAIL example {identifier}: {reason}")
                continue
            report.append(f"fill example {identifier}: {_record(node, outputs)}")
            changed = True
        if changed:
            yaml.dump(document, path)

    for path in sorted(TUTORIALS_DIR.glob("*.yaml")):
        document = yaml.load(path)
        spec = InputSpec.model_validate(dict(document["input"]))
        changed = False
        for number, node in enumerate(document.get("steps", []), start=1):
            identifier = f"{document['id']}/{number}"
            if not wanted(identifier, node):
                continue
            options = RunOptions.model_validate(json.loads(json.dumps(node.get("options", {}))))
            outputs, reason = await _outputs(str(node["solution"]), spec, options, sources, settings)
            if outputs is None:
                report.append(f"FAIL tutorial {identifier}: {reason}")
                continue
            report.append(f"fill tutorial {identifier}: {_record(node, outputs)}")
            changed = True
        if changed:
            yaml.dump(document, path)

    if STARTERS_FILE.is_file():
        document = yaml.load(STARTERS_FILE)
        changed = False
        for node in document.get("starters", []):
            identifier = f"starter:{node['ref']}"
            if not wanted(identifier, node):
                continue
            spec = InputSpec(ref=str(node["ref"]))
            options = RunOptions.model_validate(json.loads(json.dumps(node.get("options", {}))))
            outputs, reason = await _outputs(str(node["program"]), spec, options, sources, settings)
            if outputs is None:
                report.append(f"FAIL {identifier}: {reason}")
                continue
            report.append(f"fill {identifier}: {_record(node, outputs)}")
            changed = True
        if changed:
            yaml.dump(document, STARTERS_FILE)

    for path in sorted(GUIDE_DIR.glob("*.md")):
        report.extend(await _fill_chapter(path, sources, settings, prefix=prefix, overwrite=overwrite))
    return report


async def _fill_chapter(
    path: Path, sources: Sources, settings: Settings, *, prefix: str | None, overwrite: bool
) -> list[str]:
    """Fill expected outputs of one chapter's snippets, appending a line to each block."""
    chapter = parse_chapter(path)
    text = path.read_text()
    report: list[str] = []
    snippets = iter(chapter.snippets)
    pieces: list[str] = []
    cursor = 0
    for block in SNIPPET_BLOCK.finditer(text):
        snippet = next(snippets)
        pieces.append(text[cursor : block.start()])
        cursor = block.end()
        original = block.group(0)
        body = block["body"]
        has_expected = any(line.startswith(("expected:", "digest:")) for line in body.splitlines())
        skip = (prefix is not None and not snippet.id.startswith(prefix)) or snippet.error is not None
        if skip or (has_expected and not overwrite):
            pieces.append(original)
            continue
        outputs, reason = await _outputs(snippet.program, snippet.input, snippet.options, sources, settings)
        if outputs is None:
            report.append(f"FAIL snippet {snippet.id}: {reason}")
            pieces.append(original)
            continue
        kept = [line for line in body.splitlines() if not line.startswith(("expected:", "digest:"))]
        size = len(json.dumps(outputs, ensure_ascii=False).encode())
        if size > INLINE_LIMIT_BYTES:
            kept.append(f"digest: {digest(outputs)}")
            report.append(f"fill snippet {snippet.id}: digest ({size} bytes)")
        else:
            kept.append("expected: " + json.dumps(outputs, ensure_ascii=False))
            report.append(f"fill snippet {snippet.id}: {_preview(outputs)}")
        pieces.append("```jq-try\n" + "\n".join(kept) + "\n```")
    pieces.append(text[cursor:])
    updated = "".join(pieces)
    if updated != text:
        path.write_text(updated)
    return report
