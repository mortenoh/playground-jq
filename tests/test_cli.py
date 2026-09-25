import json
import logging
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from playground_jq import cli
from playground_jq.cli import app
from playground_jq.content import fill as fill_module
from playground_jq.logging import configure_logging, get_logger
from playground_jq.sources.base import SourceKind
from playground_jq.sources.registry import RecordResult, Sources

runner = CliRunner()


def records(output: str) -> list[dict[str, object]]:
    return [json.loads(line) for line in output.splitlines() if line.startswith("{")]


def test_version() -> None:
    assert runner.invoke(app, ["version"]).exit_code == 0


def test_run_over_stdin_file_and_source(tmp_path: Path) -> None:
    piped = runner.invoke(app, ["run", ".a", "-c"], input='{"a": [1]}')
    assert piped.exit_code == 0
    assert piped.stdout == "[1]\n"
    path = tmp_path / "in.json"
    path.write_text('{"a": "x"}')
    from_file = runner.invoke(app, ["run", ".a", "--file", str(path), "-r"])
    assert from_file.stdout == "x\n"
    from_source = runner.invoke(app, ["run", ".store.name", "--source", "static:bookstore", "-r"])
    assert from_source.stdout == "The jq Bookshop\n"
    failing = runner.invoke(app, ["run", ".a |", "-n"])
    assert failing.exit_code == 5
    named = runner.invoke(app, ["run", "[$a, $b.n]", "-n", "-c", "--arg", "a=x", "--argjson", 'b={"n":2}'])
    assert named.stdout == '["x",2]\n'
    debug = runner.invoke(app, ["run", "1 | debug", "-n"])
    assert debug.exit_code == 0


def test_sources_list_and_fetch() -> None:
    listed = records(runner.invoke(app, ["sources", "list"]).stdout)
    assert [record["id"] for record in listed] == ["static", "echo", "dhis2"]
    fetched = runner.invoke(app, ["sources", "fetch", "echo:status-418"])
    assert '"status": 418' in fetched.stdout


def test_sources_record(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_record(self: Sources, source: SourceKind) -> list[RecordResult]:
        return [RecordResult(source=source, preset="x", ok=source == "echo", bytes=3)]

    monkeypatch.setattr(Sources, "record", fake_record)
    ok = runner.invoke(app, ["sources", "record", "--source", "echo"])
    assert ok.exit_code == 0
    assert records(ok.stdout)[0]["kind"] == "recorded"
    assert runner.invoke(app, ["sources", "record"]).exit_code == 1


def test_examples_list_show_and_verify() -> None:
    listed = records(runner.invoke(app, ["examples", "list", "--group", "manual-math"]).stdout)
    assert all(record["group"] == "manual-math" for record in listed)
    shown = runner.invoke(app, ["examples", "show", "manual-abs-1"])
    assert json.loads(shown.stdout)["id"] == "manual-abs-1"
    assert runner.invoke(app, ["examples", "show", "nope"]).exit_code == 1
    verified = runner.invoke(app, ["examples", "verify", "--group", "manual-streaming"])
    assert verified.exit_code == 0
    summary = records(verified.stdout)[-1]
    assert summary["kind"] == "summary"
    assert summary["pass"] == summary["items"]


def test_content_check_only() -> None:
    checked = runner.invoke(app, ["content", "check", "--only", "starter:static"])
    assert checked.exit_code == 0
    assert records(checked.stdout)[-1]["pass"] == 16


def test_content_errors_are_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    from playground_jq.content.library import ContentError

    def broken() -> None:
        raise ContentError("bad.yaml: broken")

    monkeypatch.setattr(cli, "load_library", broken)
    monkeypatch.setattr("sys.argv", ["pjq", "examples", "list"])
    with pytest.raises(SystemExit) as exited:
        cli.run()
    assert exited.value.code == 2


def test_content_fill_records_expected_outputs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    examples = tmp_path / "examples"
    tutorials = tmp_path / "tutorials"
    guide = tmp_path / "guide"
    for directory in (examples, tutorials, guide):
        directory.mkdir()
    (examples / "10-demo.yaml").write_text(
        "id: demo\ntitle: Demo\nexamples:\n"
        "  - id: demo-ok\n    title: ok\n    program: '.[] | {n: ., word: \"yes\"}'\n    input: {text: '[1, 2]'}\n"
        "  - id: demo-broken\n    title: broken\n    program: '.a |'\n    input: {text: '{}'}\n"
        "  - id: demo-big\n    title: big\n    program: '[range(2000)]'\n    input: {text: 'null'}\n"
        "  - id: demo-error\n    title: error\n    program: 'error(\"x\")'\n    input: {text: 'null'}\n    error: x\n"
    )
    (tutorials / "101-01-demo.yaml").write_text(
        "id: 101-01-demo\nlevel: 101\ntitle: Demo\nsummary: s\ninput: {text: '[3]'}\nsteps:\n"
        "  - title: t\n    body: b\n    task: k\n    solution: '.[0]'\n"
    )
    (guide / "01-demo.md").write_text(
        "---\ntitle: Demo\nsummary: s\nlevel: 101\n---\n\n```jq-try\nprogram: '.a'\ninput: '{\"a\": \"NO\"}'\n```\n"
    )
    starters = tmp_path / "starters.yaml"
    starters.write_text("starters:\n  - ref: static:bookstore\n    program: '.store.name'\n")
    monkeypatch.setattr(fill_module, "EXAMPLES_DIR", examples)
    monkeypatch.setattr(fill_module, "TUTORIALS_DIR", tutorials)
    monkeypatch.setattr(fill_module, "GUIDE_DIR", guide)
    monkeypatch.setattr(fill_module, "STARTERS_FILE", starters)
    filled = runner.invoke(app, ["content", "fill"])
    assert filled.exit_code == 0, filled.output
    assert "FAIL example demo-broken" in filled.stdout
    text = (examples / "10-demo.yaml").read_text()
    assert 'expected: [{"n": 1, "word": "yes"}, {"n": 2, "word": "yes"}]' in text
    assert "digest:" in text
    assert "expected: [3]" in (tutorials / "101-01-demo.yaml").read_text()
    assert 'expected: ["NO"]' in (guide / "01-demo.md").read_text()
    assert 'expected: ["The jq Bookshop"]' in starters.read_text()
    again = runner.invoke(app, ["content", "fill"])
    assert "fill example demo-ok" not in again.stdout
    shutil.rmtree(tmp_path)


def test_configure_logging_renders_json_and_console(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO", "json")
    get_logger("test").info("hello", n=1)
    logging.getLogger("uvicorn").warning("bridged")
    configure_logging("INFO", "console")
    captured = capsys.readouterr().err
    assert '"event": "hello"' in captured
    assert "bridged" in captured
