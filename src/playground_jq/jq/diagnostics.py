"""Turning jq's error text into structured errors an editor can mark."""

import re

from playground_jq.jq.models import ErrorKind, JqError

#: One compile error: the message, then where jq says it is.
COMPILE_ERROR = re.compile(
    r"jq: error: (?P<message>.+?) at <[^>]+>, line (?P<line>\d+)(?:, column (?P<column>\d+))?:"
    r"(?:\n(?P<source>[^\n]*)\n(?P<marker>[ \t]*\^+))?",
)

#: jq's closing tally, which carries nothing a person needs twice.
TALLY = re.compile(r"^jq: \d+ compile errors?$", re.MULTILINE)

#: The prefix jq puts on runtime errors printed by the command line.
RUNTIME_PREFIX = re.compile(r"^jq: error \(at [^)]*\): ", re.MULTILINE)


def compile_errors(text: str) -> list[JqError]:
    """Every compile error in jq's message, with line, column and marked span where jq gives them."""
    errors: list[JqError] = []
    for match in COMPILE_ERROR.finditer(text):
        line = int(match["line"])
        column = int(match["column"]) if match["column"] else None
        end_column: int | None = None
        marker = match["marker"]
        if column is not None and marker is not None:
            end_column = column + max(marker.count("^"), 1)
        errors.append(
            JqError(kind="compile", message=match["message"], line=line, column=column, end_column=end_column)
        )
    if errors:
        return errors
    cleaned = TALLY.sub("", text).strip()
    cleaned = cleaned.removeprefix("jq: error: ").strip()
    return [JqError(kind="compile", message=cleaned or text.strip())]


def plain_error(kind: ErrorKind, text: str) -> JqError:
    """An error jq gives no location for, with jq's prefixes removed."""
    message = RUNTIME_PREFIX.sub("", text.strip())
    message = message.removeprefix("jq: error: ").strip()
    return JqError(kind=kind, message=message)
