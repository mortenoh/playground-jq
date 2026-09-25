"""Static fixtures: hand-written datasets shipped with the package."""

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, TypeAdapter

from playground_jq.errors import Refusal
from playground_jq.sources.base import FIXTURES_DIR, Fetched, FetchRequest, InputFormat, Preset, SourceInfo

#: The catalogue of static fixtures, one entry per file under `static/`.
CATALOGUE = FIXTURES_DIR / "static.yaml"


class FixtureEntry(BaseModel):
    """One static fixture as the catalogue describes it."""

    id: str
    title: str
    description: str = ""
    file: str
    format: InputFormat = "json"
    tags: list[str] = []


_ENTRIES = TypeAdapter(list[FixtureEntry])


class StaticSource:
    """Datasets on disk; always available, never live."""

    def __init__(self, directory: Path = FIXTURES_DIR) -> None:
        """Read the catalogue under `directory`."""
        self.directory = directory
        catalogue = directory / "static.yaml"
        raw: Any = yaml.safe_load(catalogue.read_text()) if catalogue.is_file() else None
        self.entries = {entry.id: entry for entry in _ENTRIES.validate_python(raw or [])}

    def info(self) -> SourceInfo:
        """Describe the static datasets."""
        presets = [
            Preset(id=entry.id, title=entry.title, description=entry.description, format=entry.format, tags=entry.tags)
            for entry in self.entries.values()
        ]
        return SourceInfo(
            id="static",
            title="Static datasets",
            description="Hand-written datasets that ship with the playground. Always available offline.",
            live=False,
            available=True,
            presets=presets,
        )

    def path(self, preset: str) -> Path:
        """The file a fixture is stored in."""
        entry = self.entries.get(preset)
        if entry is None:
            raise Refusal(f"there is no static dataset named {preset}", code="unknown_preset", status=404)
        return self.directory / "static" / entry.file

    async def fetch(self, request: FetchRequest) -> Fetched:
        """Read one dataset."""
        if request.preset is None:
            raise Refusal("a static dataset is fetched by preset", code="preset_required", status=422)
        text = self.path(request.preset).read_text()
        entry = self.entries[request.preset]
        return Fetched(
            source="static",
            preset=request.preset,
            text=text,
            format=entry.format,
            snapshot=True,
            bytes=len(text.encode()),
        )
