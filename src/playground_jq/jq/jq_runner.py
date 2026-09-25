"""The jq runner: a child process that compiles and evaluates one jq program per request.

jq.py holds the GIL for as long as a program runs and cannot be interrupted, so a program
evaluated in the server's own process would block its event loop and no timeout could fire.
Programs run here instead, where killing the process ends them.

One JSON object per line each way. A request carries the program, its named arguments, the
input and how to read it; the reply carries the outputs, or an error with the phase it
happened in. The pipe closing ends the process.

This module is run by path, never imported, so it starts with the standard library and jq only.
"""

import json
import sys
from collections.abc import Iterator
from typing import Any

import jq

#: Typed `Any` because the jq binding ships no type information.
libjq: Any = jq

#: Closes the sandbox wrapper; the opening is on the program's first line, so line numbers are the author's.
SANDBOX_SUFFIX = "\n)"


def sandbox_prefix(env: dict[str, str]) -> str:
    """Replaces `$ENV` and `env` with the environment the request names, hiding the server's own."""
    return f"{json.dumps(env)} as $ENV | def env: $ENV; ("


def main() -> None:
    """Answer one request at a time until the pipe closes."""
    out = sys.stdout.buffer
    for line in sys.stdin.buffer:
        reply = answer(json.loads(line))
        out.write(json.dumps(reply).encode() + b"\n")
        out.flush()


def answer(request: dict[str, Any]) -> dict[str, Any]:
    """Compile the program, read the input, and collect outputs up to the limit."""
    program: str = request["program"]
    variables: dict[str, Any] = request.get("variables", {})
    try:
        libjq.compile(program, args=variables)
        wrapped = sandbox_prefix(request.get("env", {})) + program + SANDBOX_SUFFIX
        compiled = libjq.compile(wrapped, args=variables)
    except ValueError as error:
        return {"phase": "compile", "error": str(error).strip(), "outputs": [], "truncated": False}
    limit: int = request.get("max_outputs", 10_000)
    outputs: list[Any] = []
    try:
        for value in evaluate(compiled, request):
            if len(outputs) >= limit:
                return {"outputs": outputs, "truncated": True}
            outputs.append(value)
    except ValueError as error:
        message = str(error).strip()
        phase = "input" if _is_parse_error(message) else "runtime"
        return {"phase": phase, "error": message, "outputs": outputs, "truncated": False}
    return {"outputs": outputs, "truncated": False}


def evaluate(compiled: Any, request: dict[str, Any]) -> Iterator[Any]:
    """Yield every output of the program over the input, read the way the flags say."""
    text: str = request.get("input", "")
    if request.get("null_input"):
        yield from compiled.input_value(None)
        return
    if request.get("raw_input"):
        if request.get("slurp"):
            yield from compiled.input_value(text)
            return
        lines = text.split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        for line in lines:
            yield from compiled.input_value(line)
        return
    yield from compiled.input_text(text, slurp=bool(request.get("slurp")))


def _is_parse_error(message: str) -> bool:
    """Whether jq's message is about the input text rather than the program."""
    return message.startswith("parse error:")


if __name__ == "__main__":
    main()
