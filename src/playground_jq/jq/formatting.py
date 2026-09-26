"""Formatting outputs the way the jq command line prints them, and the command lines themselves."""

import json
import shlex

from pydantic import BaseModel, Field, JsonValue

from playground_jq.jq.models import RunOptions

#: The record separator `--seq` puts before every output.
RECORD_SEPARATOR = "\x1e"


def reading_flags(options: RunOptions) -> list[str]:
    """Flags that change what jq reads (`--seq` changes reading as well as printing)."""
    flags: list[str] = []
    for enabled, flag in (
        (options.null_input, "-n"),
        (options.slurp, "-s"),
        (options.raw_input, "-R"),
        (options.stream, "--stream"),
        (options.seq, "--seq"),
    ):
        if enabled:
            flags.append(flag)
    return flags


def output_flags(options: RunOptions) -> list[str]:
    """The flags that change printing (and `-e`, the exit status), in the order the command shows them.

    Order matters to jq: a later `--tab` or `--indent` overrides an earlier `-c`.
    """
    flags: list[str] = []
    for enabled, flag in (
        (options.join_output, "-j"),
        (options.raw_output0 and not options.join_output, "--raw-output0"),
        (options.raw_output and not options.join_output and not options.raw_output0, "-r"),
        (options.ascii_output, "-a"),
        (options.color, "-C"),
        (options.compact, "-c"),
        (options.sort_keys, "-S"),
        (options.tab, "--tab"),
        (options.seq, "--seq"),
        (options.exit_status, "-e"),
    ):
        if enabled:
            flags.append(flag)
    if options.indent != 2 and not options.tab and not options.compact:
        flags.extend(["--indent", str(options.indent)])
    return flags


class FilePaths(BaseModel):
    """Where the files a run needs are: slurp and raw files by variable name, and the module directory."""

    slurpfile: dict[str, str] = Field(default_factory=lambda: {})
    rawfile: dict[str, str] = Field(default_factory=lambda: {})
    modules: str | None = None


#: The names the displayed command uses for the files a playground run keeps in memory.
DISPLAY_PATHS = "display"


def variable_flags(options: RunOptions, paths: FilePaths | None = None) -> list[str]:
    """`--arg`, `--argjson`, `--slurpfile`, `--rawfile` and `-L`, with real paths or display names."""
    flags: list[str] = []
    for name, value in options.args.items():
        flags.extend(["--arg", name, value])
    for name, document in options.argjson.items():
        flags.extend(["--argjson", name, json.dumps(document, separators=(",", ":"))])
    for name in options.slurpfile:
        flags.extend(["--slurpfile", name, paths.slurpfile[name] if paths else f"{name}.json"])
    for name in options.rawfile:
        flags.extend(["--rawfile", name, paths.rawfile[name] if paths else f"{name}.txt"])
    if options.modules:
        flags.extend(["-L", paths.modules if paths and paths.modules else "modules"])
    return flags


def program_and_positional(program: str, options: RunOptions) -> list[str]:
    """The program, and after it the positional arguments with the flag that introduces them."""
    if not options.positional:
        return [program]
    return ["--jsonargs" if options.positional_json else "--args", program, *options.positional]


def format_value(value: JsonValue, options: RunOptions) -> str:
    """One output, formatted per the flags, as jq prints it."""
    raw = options.raw_output or options.join_output or options.raw_output0
    if isinstance(value, str) and raw:
        # jq quirk: with -a, raw output still prints strings as escaped JSON.
        return json.dumps(value) if options.ascii_output else value
    # A --tab after -c wins, as it does on jq's command line.
    compact = options.compact and not options.tab
    indent: str | int | None = None if compact else ("\t" if options.tab else options.indent)
    separators = (",", ":") if compact else (",", ": ")
    return json.dumps(
        value,
        indent=indent,
        separators=separators,
        ensure_ascii=options.ascii_output,
        sort_keys=options.sort_keys,
        allow_nan=False,
    )


def format_outputs(outputs: list[JsonValue], options: RunOptions) -> str:
    """Every output, joined the way the flags say."""
    parts = [format_value(value, options) for value in outputs]
    if options.seq:
        parts = [RECORD_SEPARATOR + part for part in parts]
    if options.join_output:
        return "".join(parts)
    if options.raw_output0:
        return "".join(part + "\0" for part in parts)
    return "".join(part + "\n" for part in parts)


def equivalent_command(program: str, options: RunOptions, *, reads_input: bool = True) -> str:
    """The `jq` command line that runs this program with these flags."""
    words = [
        *reading_flags(options)[: len(reading_flags(options)) - (1 if options.seq else 0)],
        *output_flags(options),
    ]
    words += variable_flags(options)
    command = ["jq", *(shlex.quote(word) for word in words)]
    command += [shlex.quote(word) for word in program_and_positional(program, options)]
    if reads_input:
        # With positional arguments a file name would be read as one, so the input is redirected.
        command += ["<", "input.json"] if options.positional else ["input.json"]
    return " ".join(command)
