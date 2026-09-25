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


def sandbox_prefix(env: dict[str, str], named: dict[str, Any] | None = None) -> str:
    """Replaces `$ENV`/`env` with the request's stand-in environment, and defines `$ARGS` as jq does."""
    arguments = json.dumps({"positional": [], "named": named or {}})
    return f"{json.dumps(env)} as $ENV | def env: $ENV; {arguments} as $ARGS | ("


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
        # Compiled bare first, so compile errors point at the author's text; $ARGS is added there too.
        libjq.compile(
            f"{json.dumps({'positional': [], 'named': variables})} as $ARGS | (" + program + "\n)", args=variables
        )
        wrapped = sandbox_prefix(request.get("env", {}), variables) + program + SANDBOX_SUFFIX
        compiled = libjq.compile(wrapped, args=variables)
    except ValueError as error:
        return {"phase": "compile", "error": str(error).strip(), "outputs": [], "truncated": False}
    limit: int = request.get("max_outputs", 10_000)
    outputs: list[Any] = []
    errors: list[dict[str, str]] = []
    for kind, piece in read_inputs(request):
        runs = compiled.input_value(piece) if kind == "value" else compiled.input_text(piece, slurp=kind == "slurp")
        try:
            # Like the jq command line, an error ends this input's outputs and the next input runs.
            for output in runs:
                if len(outputs) >= limit:
                    return {"outputs": outputs, "errors": errors, "truncated": True}
                outputs.append(output)
        except ValueError as error:
            message = str(error).strip()
            errors.append({"phase": "input" if _is_parse_error(message) else "runtime", "error": message})
            if _is_parse_error(message):
                break
    return {"outputs": outputs, "errors": errors, "truncated": False}


#: Finds where one JSON value ends; jq itself reads each value's text, so literals keep their form.
_DECODER = json.JSONDecoder()

_BLANK = " \t\n\r"


def read_inputs(request: dict[str, Any]) -> Iterator[tuple[str, Any]]:
    """The inputs, as ("value", python value), ("text", one value's JSON text) or ("slurp", all text)."""
    text: str = request.get("input", "")
    if request.get("null_input"):
        yield "value", None
        return
    if request.get("raw_input"):
        if request.get("slurp"):
            yield "value", text
            return
        lines = text.split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        for line in lines:
            yield "value", line
        return
    if request.get("slurp"):
        yield "slurp", text
        return
    position = 0
    while True:
        while position < len(text) and text[position] in _BLANK:
            position += 1
        if position >= len(text):
            return
        try:
            _, end = _DECODER.raw_decode(text, position)
        except ValueError:
            # Not something Python can delimit: let jq read the rest and say what is wrong.
            yield "text", text[position:]
            return
        yield "text", text[position:end]
        position = end


def _is_parse_error(message: str) -> bool:
    """Whether jq's message is about the input text rather than the program."""
    return message.startswith("parse error:")


if __name__ == "__main__":
    main()
