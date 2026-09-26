"""Running a program with the jq command-line binary, for what the library cannot do.

The library evaluates each input value on its own, so `input`/`inputs` never see the next
value; it has no `--stream`, no `input_filename`, and `debug`/`stderr` write to a process
nobody reads. The binary does all of that. It runs with the same stand-in environment the
library sees, so `$ENV` means the same on both.
"""

import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, JsonValue

from playground_jq.jq.diagnostics import compile_errors, plain_error
from playground_jq.jq.formatting import (
    FilePaths,
    output_flags,
    program_and_positional,
    reading_flags,
    variable_flags,
)
from playground_jq.jq.models import SANDBOX_ENV, JqError, RunOptions

#: jq's exit status for a program that did not compile.
EXIT_COMPILE = 3


class BinaryOutcome(BaseModel):
    """What one run of the binary produced."""

    outputs: list[JsonValue] = Field(default_factory=lambda: [])
    errors: list[JqError] = Field(default_factory=lambda: [])
    messages: list[str] = Field(default_factory=lambda: [])
    truncated: bool = False
    text: str | None = None
    """What jq itself printed with the output flags, when a second run was made for it."""

    exit_code: int | None = None
    """jq's exit status for the printing run."""


def locate(binary: str) -> str | None:
    """The absolute path of the jq binary, or None when it is not installed."""
    return shutil.which(binary)


def build_argv(
    executable: str, program: str, options: RunOptions, paths: FilePaths | None = None, *, printing: bool = False
) -> list[str]:
    """The argument vector: compact JSON out, so every stdout line is one value we parse.

    With `printing`, the output flags instead, in the order the equivalent command shows them.
    """
    reading = reading_flags(options)
    argv = [executable, *reading, *output_flags(options)] if printing else [executable, "-c", *reading]
    if printing and options.seq:
        argv.remove("--seq")
    return [*argv, *variable_flags(options, paths), *program_and_positional(program, options)]


async def run_binary(
    executable: str,
    program: str,
    input_text: str,
    options: RunOptions,
    *,
    timeout: float,
    max_outputs: int,
) -> BinaryOutcome:
    """Run the binary over the input, killing it when the timeout is reached.

    One run with `-c` gives the values; a second run with the output flags gives the text exactly
    as jq prints it, and jq's exit status. Slurp files, raw files and modules are written to a
    temporary directory for the length of the run.
    """
    with tempfile.TemporaryDirectory(prefix="pjq-") as scratch:
        paths = write_files(Path(scratch), options)
        async with asyncio.timeout(timeout):
            stdout, stderr, status = await _exec(build_argv(executable, program, options, paths), input_text)
            outcome = read_outcome(stdout, stderr, status, max_outputs)
            if not outcome.truncated:
                argv = build_argv(executable, program, options, paths, printing=True)
                printed, _, printed_status = await _exec(argv, input_text)
                outcome.text = printed
                outcome.exit_code = printed_status
    return outcome


def write_files(scratch: Path, options: RunOptions) -> FilePaths:
    """Write the run's slurp files, raw files and modules; answer where they are."""
    paths = FilePaths()
    for name, text in options.slurpfile.items():
        path = scratch / f"slurp-{name}.json"
        path.write_text(text)
        paths.slurpfile[name] = str(path)
    for name, text in options.rawfile.items():
        path = scratch / f"raw-{name}.txt"
        path.write_text(text)
        paths.rawfile[name] = str(path)
    if options.modules:
        modules = scratch / "modules"
        modules.mkdir()
        for name, text in options.modules.items():
            (modules / f"{name}.jq").write_text(text)
        paths.modules = str(modules)
    return paths


async def _exec(argv: list[str], input_text: str) -> tuple[str, str, int]:
    """One run of the binary; killed when the surrounding timeout cancels it."""
    process = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SANDBOX_ENV,
    )
    try:
        stdout, stderr = await process.communicate(input_text.encode())
    except (TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.wait()
        raise
    return stdout.decode(), stderr.decode(), process.returncode or 0


def read_outcome(stdout: str, stderr: str, returncode: int, max_outputs: int) -> BinaryOutcome:
    """Parse the binary's two streams and exit status into outputs, errors and messages."""
    outcome = BinaryOutcome()
    for raw in stdout.splitlines():
        line = raw.lstrip("\x1e")
        if not line:
            continue
        if len(outcome.outputs) >= max_outputs:
            outcome.truncated = True
            break
        outcome.outputs.append(json.loads(line))
    if returncode == EXIT_COMPILE:
        outcome.errors = compile_errors(stderr)
        return outcome
    for line in stderr.splitlines():
        classified = _classify(line)
        if isinstance(classified, JqError):
            outcome.errors.append(classified)
        elif classified:
            outcome.messages.append(classified)
    if returncode != 0 and not outcome.errors:
        detail = "\n".join(outcome.messages) or f"jq exited with status {returncode}"
        outcome.errors.append(JqError(kind="runtime", message=detail))
        outcome.messages = []
    return outcome


def _classify(line: str) -> JqError | str:
    """One stderr line: an error jq reports, or a message the program wrote."""
    if line.startswith("jq: parse error:"):
        return plain_error("input", line.removeprefix("jq: "))
    if line.startswith("jq: error"):
        return plain_error("runtime", line)
    if line.startswith('["DEBUG:",'):
        parsed: Any = json.loads(line)
        return "DEBUG: " + json.dumps(parsed[1], separators=(",", ":"))
    return line
