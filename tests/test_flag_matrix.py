"""Every flag and meaningful combination, on every server engine, against the real jq binary's text.

The ground truth is `jq <flags> <program>` itself: its exact stdout, and its exit status. Each
case runs through `run_program` on the jq.py library and on the binary engine, and the printed
text must be identical. Needs jq 1.8 on PATH.
"""

import itertools
import json
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import pytest

from playground_jq.config import Settings
from playground_jq.jq.engine import needs_cli, run_program
from playground_jq.jq.models import RunOptions

#: The jq on PATH, resolved now: with the stand-in environment below there is no PATH, and a
#: bare "jq" would fall back to /usr/bin (on macOS, Apple's jq 1.7).
JQ = shutil.which("jq")

pytestmark = pytest.mark.skipif(JQ is None, reason="needs the jq binary")

#: Several values; nesting, unicode, a tab inside a string, a key order to sort, a float and an integer.
JSON_INPUT = '{"b": 1, "a": {"z": [1, "ø", 2.5, 10], "y": null}, "s": "tab\\there", "t": true}\n{"b": 2, "s": "two"}\n'

#: Plain text lines, for -R.
TEXT_INPUT = "alpha,1\nbeta,2\ngamma,3\n"

#: (flags, options, program, input)
CASES: list[tuple[list[str], dict[str, Any], str, str]] = []

#: Each output flag alone, over several programs that output objects, strings and numbers.
OUTPUT_FLAGS: list[tuple[list[str], dict[str, Any]]] = [
    ([], {}),
    (["-c"], {"compact": True}),
    (["-r"], {"raw_output": True}),
    (["-j"], {"join_output": True}),
    (["-a"], {"ascii_output": True}),
    (["-S"], {"sort_keys": True}),
    (["--tab"], {"tab": True}),
    (["--indent", "0"], {"indent": 0}),
    (["--indent", "1"], {"indent": 1}),
    (["--indent", "4"], {"indent": 4}),
    (["--indent", "7"], {"indent": 7}),
    (["-r", "-j"], {"raw_output": True, "join_output": True}),
    (["-c", "-S"], {"compact": True, "sort_keys": True}),
    (["-c", "-a"], {"compact": True, "ascii_output": True}),
    (["-r", "-a"], {"raw_output": True, "ascii_output": True}),
    (["-S", "--tab"], {"sort_keys": True, "tab": True}),
    (["-S", "--indent", "4"], {"sort_keys": True, "indent": 4}),
    (["-c", "--tab"], {"compact": True, "tab": True}),
]
for flags, options in OUTPUT_FLAGS:
    for program in (".", ".s", ".a.z[]"):
        CASES.append((flags, options, program, JSON_INPUT))

#: Flags that change how input is read or what the program sees.
CASES.extend(
    [
        (["-s"], {"slurp": True}, "length, map(.b)", JSON_INPUT),
        (["-s", "-c"], {"slurp": True, "compact": True}, ".", JSON_INPUT),
        (["-n"], {"null_input": True}, ".", JSON_INPUT),
        (["-n"], {"null_input": True}, "[inputs | .b]", JSON_INPUT),
        (["-n"], {"null_input": True}, "input | .s", JSON_INPUT),
        (["-R"], {"raw_input": True}, ".", TEXT_INPUT),
        (["-R", "-c"], {"raw_input": True, "compact": True}, 'split(",")', TEXT_INPUT),
        (["-R", "-s"], {"raw_input": True, "slurp": True}, ".", TEXT_INPUT),
        (["-R", "-s", "-c"], {"raw_input": True, "slurp": True, "compact": True}, 'split("\\n")', TEXT_INPUT),
        (["-R", "-n"], {"raw_input": True, "null_input": True}, "[inputs]", TEXT_INPUT),
        (["-R", "-r"], {"raw_input": True, "raw_output": True}, "ascii_upcase", TEXT_INPUT),
        (["--stream", "-c"], {"stream": True, "compact": True}, ".", JSON_INPUT),
        (["--stream"], {"stream": True}, "select(length == 2)", JSON_INPUT),
        (["-n", "--stream", "-c"], {"null_input": True, "stream": True, "compact": True}, "[inputs]", JSON_INPUT),
        (["--seq"], {"seq": True}, ".b", JSON_INPUT),
        (["-n", "--seq"], {"null_input": True, "seq": True}, "1, [2, 3]", ""),
        (["-n", "--seq", "-c"], {"null_input": True, "seq": True, "compact": True}, '{"a": 1}, "x"', ""),
        (["-n", "--arg", "name", "jq"], {"null_input": True, "args": {"name": "jq"}}, "$name", ""),
        (
            ["-n", "--argjson", "n", '{"x": [1, 2]}'],
            {"null_input": True, "argjson": {"n": {"x": [1, 2]}}},
            "$n.x | add",
            "",
        ),
        (
            ["-n", "-c", "--arg", "a", "1", "--argjson", "b", "2"],
            {"null_input": True, "compact": True, "args": {"a": "1"}, "argjson": {"b": 2}},
            "[$a, $b, $ARGS.named]",
            "",
        ),
        (["-c"], {"compact": True}, ".b | 1 / (. - 1)", JSON_INPUT),
        (["-e"], {"exit_status": True}, ".t", JSON_INPUT),
        (["-e"], {"exit_status": True}, ".b > 1", JSON_INPUT),
        (["-e"], {"exit_status": True}, "empty", JSON_INPUT),
        (["-e"], {"exit_status": True}, ".missing", JSON_INPUT),
        (["--raw-output0"], {"raw_output0": True}, ".s", JSON_INPUT),
        (["--raw-output0"], {"raw_output0": True}, ".a.z[]", JSON_INPUT),
        (["-C"], {"color": True}, ".", JSON_INPUT),
        (["-C", "-c"], {"color": True, "compact": True}, ".", JSON_INPUT),
        (["-C", "-S", "--tab"], {"color": True, "sort_keys": True, "tab": True}, ".a", JSON_INPUT),
        (["-n", "-c", "--args"], {"null_input": True, "compact": True, "positional": ["a", "b c"]}, "$ARGS", ""),
        (
            ["-n", "-c", "--jsonargs"],
            {"null_input": True, "compact": True, "positional": ["1", '{"x": [2]}'], "positional_json": True},
            "$ARGS.positional",
            "",
        ),
        (["-c", "--args"], {"compact": True, "positional": ["x"]}, "[.b, $ARGS.positional]", JSON_INPUT),
        (
            ["-n", "-c", "--slurpfile", "s", "s.json", "--rawfile", "r", "r.txt"],
            {"null_input": True, "compact": True, "slurpfile": {"s": "1 2.50\n[3]"}, "rawfile": {"r": "raw\ntext\n"}},
            "[$s, $r]",
            "",
        ),
        (
            ["-L", "modules"],
            {"modules": {"m": "def double: . * 2;", "n": 'def greet: "hi \\(.)";'}},
            'import "m" as m; include "n"; .b | m::double, greet',
            JSON_INPUT,
        ),
    ]
)


def jq_itself(argv: list[str], text: str, options: RunOptions) -> tuple[str, bool, int]:
    """What the jq binary prints for these arguments, whether it reported an error, and its exit status.

    It runs in a scratch directory holding the files the arguments name (`name.json`, `name.txt`,
    `modules/`), as the playground's displayed command does. jq's exit status only reflects the
    last input, so stderr is what says whether anything failed.
    """
    with tempfile.TemporaryDirectory() as scratch:
        where = Path(scratch)
        for name, content in options.slurpfile.items():
            (where / f"{name}.json").write_text(content)
        for name, content in options.rawfile.items():
            (where / f"{name}.txt").write_text(content)
        if options.modules:
            (where / "modules").mkdir()
            for name, content in options.modules.items():
                (where / "modules" / f"{name}.jq").write_text(content)
        done = subprocess.run(
            [str(JQ), *argv],
            input=text.encode(),
            capture_output=True,
            env={"HOME": "/home/learner", "TZ": "UTC"},
            cwd=scratch,
            check=False,
        )
    return done.stdout.decode(), "jq: error" in done.stderr.decode(), done.returncode


#: Printing styles that override each other on jq's command line, where the order decides.
CONFLICTS = ({"-c", "--tab", "--indent"}, {"-j", "--raw-output0"})


@pytest.mark.parametrize(
    ("flags", "options", "program", "text"),
    CASES,
    ids=[f"{' '.join(flags) or 'default'} | {program}" for flags, _, program, _ in CASES],
)
@pytest.mark.parametrize("engine", ["library", "cli"])
async def test_engine_prints_what_jq_prints(
    engine: str, flags: list[str], options: dict[str, Any], program: str, text: str
) -> None:
    run_options = RunOptions.model_validate({**options, "engine": engine})
    if engine == "library" and needs_cli(program, run_options, text):
        pytest.skip("this case needs the jq binary, which auto routes it to")
    result = await run_program(program, text, run_options, Settings(dhis2_enabled=False))
    # The command the playground shows, run in a terminal, must print exactly what it shows.
    shown = shlex.split(result.command)
    assert shown[0] == "jq"
    argv = [arg for arg in shown[1:] if arg not in ("input.json", "<")]
    assert program in argv
    expected, failed, status = jq_itself(argv, text, run_options)
    assert result.text == expected, json.dumps({"ours": result.text, "jq": expected, "command": result.command})
    assert result.ok == (not failed)
    if result.exit_code is not None:
        assert result.exit_code == status, (result.exit_code, status)
    # And the flags themselves took effect: jq given the case's own flags prints the same, unless
    # the case sets two printing styles that override each other, where jq's order decides.
    if not any(len(group & set(flags)) > 1 for group in CONFLICTS):
        own = [*flags, program, *options.get("positional", [])]
        assert result.text == jq_itself(own, text, run_options)[0]


#: Every pair of on/off flags, and each flag with `--indent 0` and `--indent 4`.
BOOLEAN_FLAGS: list[tuple[str, str]] = [
    ("-n", "null_input"),
    ("-s", "slurp"),
    ("-R", "raw_input"),
    ("-r", "raw_output"),
    ("-j", "join_output"),
    ("-a", "ascii_output"),
    ("-c", "compact"),
    ("-S", "sort_keys"),
    ("--tab", "tab"),
    ("--seq", "seq"),
    ("--stream", "stream"),
    ("-e", "exit_status"),
    ("--raw-output0", "raw_output0"),
    ("-C", "color"),
]

#: Kept number literals, unicode, a tab in a string, nesting and two values.
PAIR_JSON = '{"b": 24.0, "a": {"z": [1.000, "ø", 1e3]}, "s": "tab\\there"}\n{"b": 2, "s": "two"}\n'

#: The same shapes with only canonical numbers: the jq.py engine runs these itself (kept literals
#: are sent to the binary, which PAIR_JSON covers).
PAIR_JSON_PLAIN = '{"b": 24, "a": {"z": [1, "ø", 1000]}, "s": "tab\\there"}\n{"b": 2, "s": "two"}\n'


def pair_case(pairs: list[tuple[str, str]], indent: int | None = None) -> tuple[list[str], dict[str, Any], str, str]:
    """One case: the flags, the options, a program that shows them, and an input they can read."""
    names = {name for _, name in pairs}
    flags = [flag for flag, name in BOOLEAN_FLAGS if name in names]
    options: dict[str, Any] = {name: True for name in names}
    if indent is not None:
        flags += ["--indent", str(indent)]
        options["indent"] = indent
    raw = "raw_input" in names
    text = TEXT_INPUT if raw else PAIR_JSON
    if "null_input" in names:
        program = "[inputs]"
    elif raw:
        program = "., length"
    else:
        program = "., .s"
    return flags, options, program, text


PAIR_CASES = [pair_case(list(pair)) for pair in itertools.combinations(BOOLEAN_FLAGS, 2)] + [
    pair_case([flag], indent) for flag in BOOLEAN_FLAGS for indent in (0, 4)
]

#: Every triple of on/off flags.
TRIPLE_CASES = [pair_case(list(triple)) for triple in itertools.combinations(BOOLEAN_FLAGS, 3)]


@pytest.mark.parametrize(
    ("flags", "options", "program", "text"),
    PAIR_CASES,
    ids=[f"{' '.join(flags)} | {program}" for flags, _, program, _ in PAIR_CASES],
)
@pytest.mark.parametrize("engine", ["library", "cli"])
async def test_flag_pairs_print_what_jq_prints(
    engine: str, flags: list[str], options: dict[str, Any], program: str, text: str
) -> None:
    if engine == "library" and text == PAIR_JSON:
        text = PAIR_JSON_PLAIN
    await test_engine_prints_what_jq_prints(engine, flags, options, program, text)


@pytest.mark.parametrize(
    ("flags", "options", "program", "text"),
    TRIPLE_CASES,
    ids=[f"{' '.join(flags)} | {program}" for flags, _, program, _ in TRIPLE_CASES],
)
@pytest.mark.parametrize("engine", ["library", "cli"])
async def test_flag_triples_print_what_jq_prints(
    engine: str, flags: list[str], options: dict[str, Any], program: str, text: str
) -> None:
    if engine == "library" and text == PAIR_JSON:
        text = PAIR_JSON_PLAIN
    await test_engine_prints_what_jq_prints(engine, flags, options, program, text)
