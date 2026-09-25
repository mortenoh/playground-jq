"""Running one jq program: pick the engine, enforce the limits, format the result."""

import re
import time
from typing import Any, Literal, cast

from pydantic import JsonValue

from playground_jq.config import Settings
from playground_jq.jq.binary import locate, run_binary
from playground_jq.jq.diagnostics import compile_errors, plain_error
from playground_jq.jq.formatting import equivalent_command, format_outputs
from playground_jq.jq.models import SANDBOX_ENV, JqError, RunOptions, RunResult
from playground_jq.jq.runner import POOL, RunnerPool, RunnerStopped
from playground_jq.sources.geojson import is_geojson

#: Builtins only the command line gives their full meaning: the library evaluates every
#: input value on its own and has nowhere to send `debug`/`stderr`.
CLI_ONLY = re.compile(r"(?<![\w$.])(input|inputs|input_filename|input_line_number|debug|stderr|halt|halt_error)\b")


#: An integer literal longer than a double holds exactly; jq 1.8 keeps it, jq.py rounds it.
BIG_INTEGER = re.compile(r"(?<![\d.])\d{16,}(?![\d.])")


def needs_cli(program: str, options: RunOptions, input_text: str = "") -> bool:
    """Whether this program, its flags or its input need the command-line binary.

    `--seq` changes how input is read as well as how output is written, so it runs where jq
    implements both; large integer literals keep their precision only in jq itself.
    """
    if options.stream or options.seq or CLI_ONLY.search(program):
        return True
    return bool(BIG_INTEGER.search(program) or BIG_INTEGER.search(input_text))


def reads_input(program: str, options: RunOptions) -> bool:
    """Whether the run reads any input text at all."""
    return not options.null_input or bool(re.search(r"(?<![\w$.])inputs?\b", program))


async def run_program(
    program: str,
    input_text: str,
    options: RunOptions,
    settings: Settings,
    *,
    pool: RunnerPool = POOL,
) -> RunResult:
    """Run a program over an input text with the given flags."""
    started = time.perf_counter()
    engine: Literal["library", "cli"] = "library"
    if options.engine == "cli" or (options.engine == "auto" and needs_cli(program, options, input_text)):
        engine = "cli"
    command = equivalent_command(program, options, reads_input=reads_input(program, options))

    def finish(
        outputs: list[JsonValue], errors: list[JqError], *, truncated: bool = False, messages: list[str] | None = None
    ) -> RunResult:
        text = format_outputs(outputs, options)
        if len(text.encode()) > settings.jq_max_output_bytes:
            text = text.encode()[: settings.jq_max_output_bytes].decode(errors="ignore")
            truncated = True
        return RunResult(
            ok=not errors,
            engine=engine,
            outputs=outputs,
            text=text,
            errors=errors,
            messages=messages or [],
            truncated=truncated,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            is_geojson=len(outputs) == 1 and not errors and is_geojson(outputs[0]),
            command=command,
        )

    if len(input_text.encode()) > settings.jq_max_input_bytes:
        limit = f"the input is larger than the {settings.jq_max_input_bytes} byte limit"
        return finish([], [JqError(kind="limit", message=limit)])
    if engine == "cli":
        executable = locate(settings.jq_binary)
        if executable is None:
            missing = f"this program needs the jq command line ({settings.jq_binary}), which is not installed"
            return finish([], [JqError(kind="unavailable", message=missing)])
        try:
            outcome = await run_binary(
                executable,
                program,
                input_text,
                options,
                timeout=settings.jq_timeout_seconds,
                max_outputs=settings.jq_max_outputs,
            )
        except TimeoutError:
            return finish([], [_timeout(settings)])
        return finish(outcome.outputs, outcome.errors, truncated=outcome.truncated, messages=outcome.messages)
    request: dict[str, Any] = {
        "program": program,
        "variables": {**options.args, **options.argjson},
        "input": input_text,
        "slurp": options.slurp,
        "null_input": options.null_input,
        "raw_input": options.raw_input,
        "max_outputs": settings.jq_max_outputs,
        "env": SANDBOX_ENV,
    }
    try:
        reply = await pool.run(request, settings.jq_timeout_seconds)
    except TimeoutError:
        return finish([], [_timeout(settings)])
    except RunnerStopped as error:
        return finish([], [JqError(kind="runtime", message=str(error))])
    outputs = cast("list[JsonValue]", reply.get("outputs", []))
    errors: list[JqError] = []
    if "error" in reply:
        message = cast("str", reply["error"])
        errors = compile_errors(message) if reply.get("phase") == "compile" else [plain_error("runtime", message)]
    for failure in cast("list[dict[str, str]]", reply.get("errors", [])):
        errors.append(plain_error("input" if failure["phase"] == "input" else "runtime", failure["error"]))
    return finish(outputs, errors, truncated=bool(reply.get("truncated")))


def _timeout(settings: Settings) -> JqError:
    """The error a run that ran out of time is answered with."""
    return JqError(
        kind="timeout", message=f"the program ran longer than {settings.jq_timeout_seconds:g}s and was stopped"
    )
