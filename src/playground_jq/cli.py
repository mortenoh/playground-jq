"""The `pjq` command line: serve the playground, run programs, record sources, verify content.

On a terminal, commands print tables; otherwise every command writes NDJSON, one record per
line, each with a `kind`.
"""

import asyncio
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Annotated, Any

import typer
import uvicorn
from pydantic import BaseModel
from rich.console import Console
from rich.table import Table

from playground_jq import __version__
from playground_jq.config import get_settings
from playground_jq.content.library import load_library
from playground_jq.content.verify import Verdict, items, verify_item
from playground_jq.jq.engine import run_program
from playground_jq.jq.models import RunOptions
from playground_jq.logging import configure_logging
from playground_jq.sources.base import SourceKind
from playground_jq.sources.registry import Sources

app = typer.Typer(help="A playground for learning jq.", no_args_is_help=True, add_completion=False)
sources_app = typer.Typer(help="Input sources: static datasets, postman-echo and DHIS2.", no_args_is_help=True)
examples_app = typer.Typer(help="The example library.", no_args_is_help=True)
content_app = typer.Typer(help="Check and fill all content: examples, tutorials, guide snippets.", no_args_is_help=True)
app.add_typer(sources_app, name="sources")
app.add_typer(examples_app, name="examples")
app.add_typer(content_app, name="content")

console = Console()
err_console = Console(stderr=True)


def _tty() -> bool:
    return sys.stdout.isatty()


def emit(kind: str, record: BaseModel | dict[str, Any]) -> None:
    """Write one NDJSON record."""
    data = record.model_dump(mode="json") if isinstance(record, BaseModel) else record
    sys.stdout.write(json.dumps({"kind": kind, **data}) + "\n")


def build_app() -> Any:
    """The application factory uvicorn calls."""
    from playground_jq.app import create_app

    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    return create_app(settings)


@app.command()
def version() -> None:
    """Print the version."""
    typer.echo(__version__)


@app.command()
def serve(
    host: Annotated[str | None, typer.Option(help="Interface to listen on.")] = None,
    port: Annotated[int | None, typer.Option(help="Port to listen on.")] = None,
    reload: Annotated[bool, typer.Option(help="Restart when the source changes.")] = False,
) -> None:
    """Serve the playground: the API and the built UI."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    uvicorn.run(
        "playground_jq.cli:build_app",
        factory=True,
        host=host or settings.host,
        port=port or settings.port,
        reload=reload,
        reload_dirs=[str(Path(__file__).resolve().parent)] if reload else None,
        reload_includes=["*.py", "*.yaml", "*.md"] if reload else None,
        log_level=settings.log_level.lower(),
    )


@app.command()
def dev(
    host: Annotated[str | None, typer.Option(help="Interface to listen on.")] = None,
    port: Annotated[int | None, typer.Option(help="Port to listen on.")] = None,
) -> None:
    """Serve with reload, for development (pair with `make ui-dev`)."""
    serve(host=host, port=port, reload=True)


@app.command("run")
def run_command(
    program: Annotated[str, typer.Argument(help="The jq program.")],
    file: Annotated[Path | None, typer.Option("--file", "-f", help="Read the input from a file.")] = None,
    source: Annotated[str | None, typer.Option(help="Read the input from a preset, as source:preset.")] = None,
    live: Annotated[bool, typer.Option(help="Fetch a live preset instead of its snapshot.")] = False,
    slurp: Annotated[bool, typer.Option("--slurp", "-s")] = False,
    null_input: Annotated[bool, typer.Option("--null-input", "-n")] = False,
    raw_input: Annotated[bool, typer.Option("--raw-input", "-R")] = False,
    raw_output: Annotated[bool, typer.Option("--raw-output", "-r")] = False,
    join_output: Annotated[bool, typer.Option("--join-output", "-j")] = False,
    compact: Annotated[bool, typer.Option("--compact-output", "-c")] = False,
    sort_keys: Annotated[bool, typer.Option("--sort-keys", "-S")] = False,
    engine: Annotated[str, typer.Option(help="auto, library or cli.")] = "auto",
) -> None:
    """Run a program the way the playground does: over stdin, a file, or a source preset."""
    from playground_jq.sources.registry import InputRef

    settings = get_settings()
    options = RunOptions.model_validate(
        {
            "slurp": slurp,
            "null_input": null_input,
            "raw_input": raw_input,
            "raw_output": raw_output,
            "join_output": join_output,
            "compact": compact,
            "sort_keys": sort_keys,
            "engine": engine,
        }
    )

    async def go() -> int:
        text = ""
        if source is not None:
            text = (await Sources(settings).read(InputRef.parse(source), live=live)).text
        elif file is not None:
            text = file.read_text()
        elif not null_input and not sys.stdin.isatty():
            text = sys.stdin.read()
        result = await run_program(program, text, options, settings)
        sys.stdout.write(result.text)
        for message in result.messages:
            err_console.print(message, markup=False, highlight=False)
        for error in result.errors:
            where = f" (line {error.line}, column {error.column})" if error.line else ""
            err_console.print(f"jq {error.kind} error{where}: {error.message}", markup=False, highlight=False)
        return 0 if result.ok else 5

    raise typer.Exit(asyncio.run(go()))


@sources_app.command("list")
def sources_list() -> None:
    """List every source and its presets."""
    infos = Sources(get_settings()).infos()
    if not _tty():
        for info in infos:
            emit("source", info)
        return
    for info in infos:
        table = Table(title=f"{info.title} ({info.id})", title_justify="left")
        table.add_column("preset")
        table.add_column("title")
        table.add_column("format")
        table.add_column("tags")
        for preset in info.presets:
            table.add_row(f"{info.id}:{preset.id}", preset.title, preset.format, ", ".join(preset.tags))
        console.print(table)


@sources_app.command("fetch")
def sources_fetch(
    ref: Annotated[str, typer.Argument(help="source:preset")],
    live: Annotated[bool, typer.Option(help="Fetch live instead of reading the snapshot.")] = False,
) -> None:
    """Print the input text of one preset."""
    from playground_jq.sources.registry import InputRef

    fetched = asyncio.run(Sources(get_settings()).read(InputRef.parse(ref), live=live))
    sys.stdout.write(fetched.text)


@sources_app.command("record")
def sources_record(
    source: Annotated[list[str] | None, typer.Option(help="echo and/or dhis2; both when not given.")] = None,
) -> None:
    """Fetch every live preset and write it as its recorded snapshot."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    chosen: list[SourceKind] = [s for s in ("echo", "dhis2") if not source or s in source]

    async def go() -> bool:
        registry = Sources(settings)
        ok = True
        try:
            for kind in chosen:
                for result in await registry.record(kind):
                    ok = ok and result.ok
                    if _tty():
                        mark = "ok  " if result.ok else "FAIL"
                        console.print(
                            f"{mark} {result.source}:{result.preset} {result.bytes} bytes {result.error or ''}"
                        )
                    else:
                        emit("recorded", result)
        finally:
            await registry.close()
        return ok

    if not asyncio.run(go()):
        raise typer.Exit(1)


@examples_app.command("list")
def examples_list(group: Annotated[str | None, typer.Option(help="Only this group.")] = None) -> None:
    """List examples by group."""
    library = load_library()
    for g in library.groups:
        if group and g.id != group:
            continue
        if not _tty():
            for example in g.examples:
                emit("example", {"id": example.id, "group": g.id, "title": example.title, "level": example.level})
            continue
        table = Table(title=f"{g.title} ({g.id}, {len(g.examples)})", title_justify="left")
        table.add_column("id")
        table.add_column("level")
        table.add_column("title")
        table.add_column("program", overflow="fold")
        for example in g.examples:
            table.add_row(example.id, str(example.level), example.title, example.program)
        console.print(table)


@examples_app.command("show")
def examples_show(example_id: str) -> None:
    """Show one example in full."""
    example = load_library().example(example_id)
    if example is None:
        err_console.print(f"there is no example {example_id}")
        raise typer.Exit(1)
    sys.stdout.write(example.model_dump_json(indent=2, exclude_defaults=True) + "\n")


@examples_app.command("verify")
def examples_verify(
    live: Annotated[bool, typer.Option(help="Run live-source examples against the live sources.")] = False,
    group: Annotated[str | None, typer.Option(help="Only this group.")] = None,
) -> None:
    """Run every example and check its output."""
    _verify(kinds={"example"}, live=live, group=group)


@content_app.command("check")
def content_check(
    live: Annotated[bool, typer.Option(help="Run live-source examples against the live sources.")] = False,
    only: Annotated[str | None, typer.Option(help="Only items whose id starts with this.")] = None,
) -> None:
    """Validate all content and run every example, tutorial solution and guide snippet."""
    _verify(kinds={"example", "tutorial", "snippet"}, live=live, prefix=only)


@content_app.command("fill")
def content_fill(
    only: Annotated[str | None, typer.Option(help="Only items whose id starts with this.")] = None,
    overwrite: Annotated[bool, typer.Option(help="Replace expected outputs that are already recorded.")] = False,
) -> None:
    """Record the expected output of content that has none, from a run; review the diff before committing."""
    from playground_jq.content.fill import fill

    for line in asyncio.run(fill(get_settings(), prefix=only, overwrite=overwrite)):
        console.print(line, markup=False, highlight=False)


def _verify(*, kinds: set[str], live: bool, group: str | None = None, prefix: str | None = None) -> None:
    settings = get_settings()
    library = load_library()
    group_ids = {example.id for example in library.examples() if group is None or example.group == group}
    selected = [
        item
        for item in items(library)
        if item.kind in kinds
        and (item.kind != "example" or item.id in group_ids)
        and (prefix is None or item.id.startswith(prefix))
    ]

    async def go() -> list[Verdict]:
        registry = Sources(settings)
        verdicts: list[Verdict] = []
        try:
            for item in selected:
                verdict = await verify_item(item, registry, settings, live=live)
                verdicts.append(verdict)
                if not _tty():
                    emit("verdict", verdict.model_dump(exclude={"outputs"}))
                elif verdict.status in ("fail", "drift"):
                    console.print(
                        f"{verdict.status.upper():5} {verdict.kind} {verdict.id}: {verdict.reason}", markup=False
                    )
        finally:
            await registry.close()
        return verdicts

    verdicts = asyncio.run(go())
    counts = Counter(verdict.status for verdict in verdicts)
    if _tty():
        console.print(
            f"{len(verdicts)} items: {counts['pass']} pass, {counts['drift']} drift, "
            f"{counts['fail']} fail, {counts['skip']} skip"
        )
    else:
        emit("summary", {"items": len(verdicts), **{str(status): n for status, n in counts.items()}})
    if counts["fail"]:
        raise typer.Exit(1)


def run() -> None:
    """Entry point for the `pjq` and `playground-jq` scripts."""
    app()
