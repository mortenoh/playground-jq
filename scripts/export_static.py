"""Export everything the static (GitHub Pages) build reads, by calling the real API routes.

Writes `<out>/static-api/`: sources, every example, tutorial, guide chapter and builtin, and the
text of every dataset and recorded snapshot. Calling the routes through the test client keeps
the static files identical in shape to what the server answers.

    uv run python scripts/export_static.py frontend/dist
"""

import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi.testclient import TestClient

from playground_jq.app import create_app
from playground_jq.config import Settings


def main(out: Path) -> None:
    """Write the static API under `out/static-api`."""
    root = out / "static-api"
    client = TestClient(create_app(Settings(ui_enabled=False, dhis2_enabled=False)))
    written = 0

    def get(path: str) -> Any:
        answered = client.get(f"/api{path}")
        answered.raise_for_status()
        return answered.json()

    def write(name: str, value: Any) -> None:
        nonlocal written
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
        written += 1

    sources = get("/sources")
    for source in sources:
        for preset in source["presets"]:
            answered = client.post(
                f"/api/sources/{source['id']}/fetch", json={"preset": preset["id"], "mode": "snapshot"}
            )
            answered.raise_for_status()
            target = root / "inputs" / source["id"] / f"{preset['id']}.txt"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(answered.json()["text"])
            written += 1
        # No server: live fetches and custom requests are not available.
        source["live"] = False
        source["available"] = source["id"] == "static"
    write("sources.json", sources)

    groups = get("/examples")
    write("examples.json", groups)
    for group in groups:
        for example in group["examples"]:
            write(f"examples/{example['id']}.json", get(f"/examples/{quote(example['id'])}"))

    tutorials = get("/tutorials")
    write("tutorials.json", tutorials)
    for tutorial in tutorials:
        write(f"tutorials/{tutorial['id']}.json", get(f"/tutorials/{quote(tutorial['id'])}"))

    chapters = get("/guide")
    write("guide.json", chapters)
    for chapter in chapters:
        write(f"guide/{chapter['slug']}.json", get(f"/guide/{quote(chapter['slug'])}"))

    write("builtins.json", get("/builtins"))
    print(f"wrote {written} files to {root}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "frontend/dist"))
