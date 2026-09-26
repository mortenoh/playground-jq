"""Every flag and meaningful combination, on every server engine, against the real jq binary's text.

The ground truth is `jq <flags> <program>` itself: its exact stdout, and its exit status. Each
case runs through `run_program` on the jq.py library and on the binary engine, and the printed
text must be identical. Needs jq 1.8 on PATH.
"""

import json
import shutil
import subprocess
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
CASES += [
    (["-s"], {"slurp": True}, "length, map(.b)", JSON_INPUT),
    (["-s", "-c"], {"slurp": True, "compact": True}, ".", JSON_INPUT),
    (["-n"], {"null_input": True}, ".", JSON_INPUT),
    (["-n"], {"null_input": True}, "[inputs | .b]", JSON_INPUT),
    (["-n"], {"null_input": True}, "input | .s", JSON_INPUT),
    (["-R"], {"raw_input": True}, ".", TEXT_INPUT),
    (["-R", "-c"], {"raw_input": True, "compact": True}, "split(\",\")", TEXT_INPUT),
    (["-R", "-s"], {"raw_input": True, "slurp": True}, ".", TEXT_INPUT),
    (["-R", "-s", "-c"], {"raw_input": True, "slurp": True, "compact": True}, "split(\"\\n\")", TEXT_INPUT),
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
]


def jq_itself(flags: list[str], program: str, text: str) -> tuple[str, bool]:
    """What the jq binary prints, and whether it reported an error (its exit status only
    reflects the last input, so stderr is what says whether anything failed)."""
    done = subprocess.run(
        [str(JQ), *flags, program],
        input=text.encode(),
        capture_output=True,
        env={"HOME": "/home/learner", "TZ": "UTC"},
        check=False,
    )
    return done.stdout.decode(), "jq: error" in done.stderr.decode()


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
    expected, failed = jq_itself(flags, program, text)
    result = await run_program(program, text, run_options, Settings(dhis2_enabled=False))
    assert result.text == expected, json.dumps({"ours": result.text, "jq": expected})
    assert result.ok == (not failed)
