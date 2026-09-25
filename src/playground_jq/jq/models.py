"""The shapes a jq run is asked for and answered with."""

from typing import Literal

from pydantic import BaseModel, Field, JsonValue

#: The environment programs see as `$ENV` and `env`, instead of the server's own.
SANDBOX_ENV = {
    "HOME": "/home/learner",
    "USER": "learner",
    "SHELL": "/bin/bash",
    "PAGER": "less",
    "LANG": "C.UTF-8",
    "TZ": "UTC",
}

#: Which jq evaluates a program: the jq.py library, the jq command-line binary, or whichever fits.
EngineName = Literal["auto", "library", "cli"]

#: Where a run failed: compiling the program, reading the input, evaluating, or hitting a limit.
ErrorKind = Literal["compile", "input", "runtime", "timeout", "limit", "unavailable"]


class RunOptions(BaseModel):
    """The command-line flags a run is made with, one field per flag."""

    slurp: bool = False
    """`-s`: read every input value into one array and run the program once over it."""

    null_input: bool = False
    """`-n`: run the program once with `null` as input, leaving the inputs to `input`/`inputs`."""

    raw_input: bool = False
    """`-R`: each input line is a string rather than JSON (the whole text with `-s`)."""

    raw_output: bool = False
    """`-r`: write string outputs without quotes."""

    join_output: bool = False
    """`-j`: like `-r`, and write no newline between outputs."""

    ascii_output: bool = False
    """`-a`: escape every non-ASCII character."""

    compact: bool = False
    """`-c`: one line per output."""

    sort_keys: bool = False
    """`-S`: write object keys in sorted order."""

    tab: bool = False
    """`--tab`: indent with a tab."""

    indent: int = Field(default=2, ge=0, le=7)
    """`--indent n`: spaces per indent level (0 means compact)."""

    seq: bool = False
    """`--seq`: prefix every output with the ASCII record separator (RFC 7464)."""

    stream: bool = False
    """`--stream`: read the input as a stream of `[path, leaf]` events (command-line jq only)."""

    args: dict[str, str] = Field(default_factory=lambda: {})
    """`--arg name value`: string variables."""

    argjson: dict[str, JsonValue] = Field(default_factory=lambda: {})
    """`--argjson name json`: JSON variables."""

    engine: EngineName = "auto"
    """Which jq evaluates the program."""


class JqError(BaseModel):
    """One thing jq refused, placed in the program when jq says where."""

    kind: ErrorKind
    """Where the run failed."""

    message: str
    """jq's own message, without the `jq: error:` prefix."""

    line: int | None = None
    """1-based line in the program, for a compile error."""

    column: int | None = None
    """1-based column in the program, for a compile error."""

    end_column: int | None = None
    """1-based column just past the marked span, for a compile error."""


class RunResult(BaseModel):
    """What a run produced."""

    ok: bool
    """Whether the program ran to the end without an error."""

    engine: Literal["library", "cli"]
    """Which jq evaluated the program."""

    outputs: list[JsonValue]
    """Every output value, in order (those before an error included)."""

    text: str
    """The outputs formatted the way the jq command line would print them."""

    errors: list[JqError] = Field(default_factory=lambda: [])
    """What jq refused; empty when the run succeeded."""

    messages: list[str] = Field(default_factory=lambda: [])
    """Lines the program wrote to stderr with `debug` or `stderr`."""

    truncated: bool = False
    """Whether outputs were dropped because a limit was reached."""

    duration_ms: float
    """Wall-clock time of the run."""

    is_geojson: bool = False
    """Whether the single output is a valid GeoJSON object."""

    command: str
    """The equivalent `jq` command line."""
