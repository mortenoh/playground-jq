from pathlib import Path

from fastapi.testclient import TestClient

from playground_jq.app import create_app
from playground_jq.config import Settings
from playground_jq.content.library import Library


def bundle(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>shell</html>")
    (tmp_path / "assets" / "app-abc.js").write_text("console.log(1)")
    return tmp_path


def test_serves_the_shell_assets_and_config(tmp_path: Path, library: Library) -> None:
    settings = Settings(ui_dir=bundle(tmp_path), dhis2_enabled=False)
    with TestClient(create_app(settings, library=library)) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert "shell" in root.text
        asset = client.get("/assets/app-abc.js")
        assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
        assert client.get("/config.json").json()["api_prefix"] == "/api"


def test_navigation_gets_the_shell_and_fetches_keep_problems(tmp_path: Path, library: Library) -> None:
    settings = Settings(ui_dir=bundle(tmp_path), dhis2_enabled=False)
    with TestClient(create_app(settings, library=library)) as client:
        deep = client.get("/learn/101-01/2", headers={"accept": "text/html"})
        assert deep.status_code == 200
        assert "shell" in deep.text
        api = client.get("/api/nothing", headers={"accept": "text/html"})
        assert api.status_code == 404
        assert api.json()["code"] == "http_error"
        fetch = client.get("/no-such-file.js")
        assert fetch.status_code == 404
        assert fetch.headers["content-type"] == "application/problem+json"


def test_missing_bundle_says_how_to_build_it(tmp_path: Path, library: Library) -> None:
    settings = Settings(ui_dir=tmp_path / "empty", dhis2_enabled=False)
    with TestClient(create_app(settings, library=library)) as client:
        answered = client.get("/", headers={"accept": "text/html"})
        assert answered.status_code == 503
        assert "make install" in answered.text


def test_ui_can_be_turned_off(library: Library) -> None:
    settings = Settings(ui_enabled=False, dhis2_enabled=False)
    with TestClient(create_app(settings, library=library)) as client:
        assert client.get("/config.json").status_code == 404
