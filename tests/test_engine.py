import pytest

from playground_jq.config import Settings
from playground_jq.jq.engine import needs_cli, run_program
from playground_jq.jq.models import RunOptions
from playground_jq.jq.runner import RunnerPool


async def test_field_access_is_formatted_like_the_cli(settings: Settings) -> None:
    result = await run_program(".a", '{"a": {"b": [1, "x"]}}', RunOptions(), settings)
    assert result.ok
    assert result.engine == "library"
    assert result.outputs == [{"b": [1, "x"]}]
    assert result.text == '{\n  "b": [\n    1,\n    "x"\n  ]\n}\n'
    assert result.command == "jq .a input.json"


async def test_several_outputs_and_raw_output(settings: Settings) -> None:
    result = await run_program(".[]", '["a", "b"]', RunOptions(raw_output=True), settings)
    assert result.outputs == ["a", "b"]
    assert result.text == "a\nb\n"


async def test_join_output_has_no_separators(settings: Settings) -> None:
    result = await run_program(".[]", '["a", 1]', RunOptions(join_output=True), settings)
    assert result.text == "a1"


async def test_compact_sort_keys_and_tab(settings: Settings) -> None:
    compact = await run_program(".", '{"b": 1, "a": [1]}', RunOptions(compact=True, sort_keys=True), settings)
    assert compact.text == '{"a":[1],"b":1}\n'
    tabbed = await run_program(".", "[1]", RunOptions(tab=True), settings)
    assert tabbed.text == "[\n\t1\n]\n"
    zero = await run_program(".", "[1]", RunOptions(indent=0), settings)
    assert zero.text == "[1]\n"


async def test_ascii_output_and_seq(settings: Settings) -> None:
    result = await run_program(".", '"ø"', RunOptions(ascii_output=True, seq=True), settings)
    assert result.text == '\x1e"\\u00f8"\n'


async def test_slurp_and_several_input_values(settings: Settings) -> None:
    each = await run_program(". * 2", "1 2 3", RunOptions(), settings)
    assert each.outputs == [2, 4, 6]
    slurped = await run_program("add", "1 2 3", RunOptions(slurp=True), settings)
    assert slurped.outputs == [6]


async def test_raw_input_lines_and_slurped(settings: Settings) -> None:
    lines = await run_program("ascii_upcase", "a\nb\n", RunOptions(raw_input=True), settings)
    assert lines.outputs == ["A", "B"]
    whole = await run_program("length", "a\nb\n", RunOptions(raw_input=True, slurp=True), settings)
    assert whole.outputs == [4]


async def test_named_arguments(settings: Settings) -> None:
    options = RunOptions(null_input=True, args={"name": "jq"}, argjson={"n": {"x": 41}})
    result = await run_program('"\\($name) \\($n.x + 1)"', "", options, settings)
    assert result.outputs == ["jq 42"]
    assert result.command == "jq -n --arg name jq --argjson n '{\"x\":41}' '\"\\($name) \\($n.x + 1)\"'"


async def test_environment_is_sandboxed(settings: Settings) -> None:
    result = await run_program("[$ENV, env]", "", RunOptions(null_input=True), settings)
    assert result.outputs == [[{}, {}]]


async def test_compile_error_is_located(settings: Settings) -> None:
    result = await run_program("def f: 1;\nf, (1 | foo)", "null", RunOptions(), settings)
    assert not result.ok
    [error] = result.errors
    assert error.kind == "compile"
    assert error.message == "foo/0 is not defined"
    assert (error.line, error.column, error.end_column) == (2, 9, 12)


async def test_runtime_error_keeps_earlier_outputs(settings: Settings) -> None:
    result = await run_program(".[] | 1 / .", "[1, 0]", RunOptions(), settings)
    assert not result.ok
    assert result.outputs == [1]
    assert result.errors[0].kind == "runtime"
    assert "divisor is zero" in result.errors[0].message


async def test_input_parse_error(settings: Settings) -> None:
    result = await run_program(".", "[1,", RunOptions(), settings)
    assert result.errors[0].kind == "input"


async def test_infinite_program_is_killed_at_the_timeout() -> None:
    settings = Settings(jq_timeout_seconds=0.5)
    pool = RunnerPool()
    result = await run_program("def f: f; f", "null", RunOptions(), settings, pool=pool)
    assert result.errors[0].kind == "timeout"
    assert result.duration_ms < 2000
    again = await run_program("1 + 1", "null", RunOptions(), settings, pool=pool)
    assert again.outputs == [2]
    pool.shutdown()


async def test_output_count_limit_truncates() -> None:
    settings = Settings(jq_max_outputs=3)
    result = await run_program("range(10)", "", RunOptions(null_input=True), settings)
    assert result.outputs == [0, 1, 2]
    assert result.truncated


async def test_output_byte_limit_truncates_text() -> None:
    settings = Settings(jq_max_output_bytes=10)
    result = await run_program("range(100)", "", RunOptions(null_input=True), settings)
    assert result.truncated
    assert len(result.text) <= 10


async def test_input_limit() -> None:
    settings = Settings(jq_max_input_bytes=4)
    result = await run_program(".", "[1,2,3]", RunOptions(), settings)
    assert result.errors[0].kind == "limit"


async def test_geojson_output_is_detected(settings: Settings) -> None:
    result = await run_program(".", '{"type": "Point", "coordinates": [10, 59]}', RunOptions(), settings)
    assert result.is_geojson
    not_geo = await run_program(".", '{"type": "Point"}', RunOptions(), settings)
    assert not not_geo.is_geojson


@pytest.mark.parametrize(
    ("program", "options", "expected"),
    [
        ("[inputs]", RunOptions(null_input=True), True),
        (".x | debug", RunOptions(), True),
        ("input_filename", RunOptions(), True),
        (".", RunOptions(stream=True), True),
        (".input | .inputs", RunOptions(), False),
        ("$input", RunOptions(), False),
        ("map(.a)", RunOptions(), False),
    ],
)
def test_needs_cli(program: str, options: RunOptions, expected: bool) -> None:
    assert needs_cli(program, options) is expected


@pytest.mark.cli_jq
async def test_inputs_run_on_the_binary(settings: Settings) -> None:
    result = await run_program("[inputs]", "1 2 3", RunOptions(null_input=True), settings)
    assert result.engine == "cli"
    assert result.outputs == [[1, 2, 3]]
    assert result.command == "jq -n '[inputs]' input.json"


@pytest.mark.cli_jq
async def test_debug_messages_are_captured(settings: Settings) -> None:
    result = await run_program(".x | debug | . + 1", '{"x": 1}', RunOptions(), settings)
    assert result.outputs == [2]
    assert result.messages == ["DEBUG: 1"]


@pytest.mark.cli_jq
async def test_stream_flag(settings: Settings) -> None:
    result = await run_program(".", '{"a": [1]}', RunOptions(stream=True), settings)
    assert result.outputs == [[["a", 0], 1], [["a", 0]], [["a"]]]


@pytest.mark.cli_jq
async def test_binary_errors(settings: Settings) -> None:
    compile_error = await run_program(".foo[", "1", RunOptions(engine="cli"), settings)
    assert compile_error.errors[0].kind == "compile"
    assert compile_error.errors[0].line == 1
    runtime = await run_program(".[] | 1 / .", "[1, 0]", RunOptions(engine="cli"), settings)
    assert runtime.outputs == [1]
    assert runtime.errors[0].kind == "runtime"
    assert runtime.errors[0].message.startswith("number (1) and number (0)")
    parse = await run_program(".", "[1,", RunOptions(engine="cli"), settings)
    assert parse.errors[0].kind == "input"
    halted = await run_program('"bye" | halt_error', "null", RunOptions(), settings)
    assert halted.errors[0].message == "bye"


@pytest.mark.cli_jq
async def test_binary_timeout() -> None:
    settings = Settings(jq_timeout_seconds=0.5)
    result = await run_program("def f: f; f", "null", RunOptions(engine="cli"), settings)
    assert result.errors[0].kind == "timeout"


async def test_missing_binary() -> None:
    settings = Settings(jq_binary="no-such-jq-binary")
    result = await run_program("[inputs]", "1", RunOptions(null_input=True), settings)
    assert result.errors[0].kind == "unavailable"
