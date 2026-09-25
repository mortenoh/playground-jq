"""Formatting outputs the way the jq command line prints them, and the equivalent command."""

import json
import shlex

from pydantic import JsonValue

from playground_jq.jq.models import RunOptions

#: The record separator `--seq` puts before every output.
RECORD_SEPARATOR = "\x1e"


def format_value(value: JsonValue, options: RunOptions) -> str:
    """One output, formatted per the flags."""
    if isinstance(value, str) and (options.raw_output or options.join_output):
        return value
    compact = options.compact
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
    return "".join(part + "\n" for part in parts)


def equivalent_command(program: str, options: RunOptions, *, reads_input: bool = True) -> str:
    """The `jq` command line that runs this program with these flags."""
    flags: list[str] = []
    for enabled, flag in (
        (options.null_input, "-n"),
        (options.slurp, "-s"),
        (options.raw_input, "-R"),
        (options.join_output, "-j"),
        (options.raw_output and not options.join_output, "-r"),
        (options.ascii_output, "-a"),
        (options.compact, "-c"),
        (options.sort_keys, "-S"),
        (options.tab, "--tab"),
        (options.seq, "--seq"),
        (options.stream, "--stream"),
    ):
        if enabled:
            flags.append(flag)
    if options.indent != 2 and not options.tab and not options.compact:
        flags.extend(["--indent", str(options.indent)])
    for name, value in options.args.items():
        flags.extend(["--arg", name, shlex.quote(value)])
    for name, document in options.argjson.items():
        flags.extend(["--argjson", name, shlex.quote(json.dumps(document, separators=(",", ":")))])
    command = ["jq", *flags, shlex.quote(program)]
    if reads_input:
        command.append("input.json")
    return " ".join(command)
