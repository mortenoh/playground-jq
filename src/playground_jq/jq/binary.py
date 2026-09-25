"""Running a program with the jq command-line binary, for what the library cannot do.

The library evaluates each input value on its own, so `input`/`inputs` never see the next
value; it has no `--stream`, no `input_filename`, and `debug`/`stderr` write to a process
nobody reads. The binary does all of that. It runs with the same stand-in environment the
library sees, so `$ENV` means the same on both.
"""

import asyncio
import json
import shutil
from typing import Any

from pydantic import BaseModel, Field, JsonValue

from playground_jq.jq.diagnostics import compile_errors, plain_error
from playground_jq.jq.models import SANDBOX_ENV, JqError, RunOptions

#: jq's exit status for a program that did not compile.
EXIT_COMPILE = 3


class BinaryOutcome(BaseModel):
    """What one run of the binary produced."""

    outputs: list[JsonValue] = Field(default_factory=lambda: [])
    errors: list[JqError] = Field(default_factory=lambda: [])
    messages: list[str] = Field(default_factory=lambda: [])
    truncated: bool = False


def locate(binary: str) -> str | None:
    """The absolute path of the jq binary, or None when it is not installed."""
    return shutil.which(binary)


def build_argv(executable: str, program: str, options: RunOptions) -> list[str]:
    """The argument vector: compact JSON out, so every stdout line is one value we parse."""
    argv = [executable, "-c"]
    for enabled, flag in (
        (options.null_input, "-n"),
        (options.slurp, "-s"),
        (options.raw_input, "-R"),
        (options.stream, "--stream"),
        (options.seq, "--seq"),
    ):
        if enabled:
            argv.append(flag)
    for name, value in options.args.items():
        argv.extend(["--arg", name, value])
    for name, document in options.argjson.items():
        argv.extend(["--argjson", name, json.dumps(document)])
    argv.append(program)
    return argv


async def run_binary(
    executable: str,
    program: str,
    input_text: str,
    options: RunOptions,
    *,
    timeout: float,
    max_outputs: int,
) -> BinaryOutcome:
    """Run the binary over the input, killing it when the timeout is reached."""
    process = await asyncio.create_subprocess_exec(
        *build_argv(executable, program, options),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=SANDBOX_ENV,
    )
    try:
        async with asyncio.timeout(timeout):
            stdout, stderr = await process.communicate(input_text.encode())
    except (TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.wait()
        raise
    return read_outcome(stdout.decode(), stderr.decode(), process.returncode or 0, max_outputs)


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
