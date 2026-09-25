"""What every input source shares: its description, its presets, and what a fetch answers with."""

import json
import time
from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, JsonValue

#: Where fixtures live inside the package: `static/`, and one recorded directory per live source.
FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"

#: Compact JSON above this size stays compact in a fixture, so large GeoJSON stays readable to an editor.
PRETTY_LIMIT_BYTES = 200_000

SourceKind = Literal["static", "echo", "dhis2"]

#: The formats an input text can be in, which decides the flags it is read with.
InputFormat = Literal["json", "ndjson", "text", "geojson"]


class Preset(BaseModel):
    """One named input a source offers."""

    id: str
    """Identifier, unique within its source."""

    title: str
    """Short name shown in the UI."""

    description: str = ""
    """What the input contains and what it is good for."""

    format: InputFormat = "json"
    """Format of the input text."""

    tags: list[str] = Field(default_factory=lambda: [])
    """Topics the input is good for, such as `geojson` or `metadata`."""

    request: dict[str, JsonValue] = Field(default_factory=lambda: {})
    """What a live source sends for this preset (method, path, params, body)."""


class SourceInfo(BaseModel):
    """A source and everything it offers."""

    id: SourceKind
    """Identifier of the source."""

    title: str
    """Short name shown in the UI."""

    description: str
    """What the source is."""

    live: bool
    """Whether the source reaches the network."""

    available: bool
    """Whether live fetches are expected to work right now."""

    presets: list[Preset]
    """Named inputs."""

    base_url: str | None = None
    """Where a live source fetches from."""


class FetchRequest(BaseModel):
    """What to fetch from a source."""

    preset: str | None = None
    """A preset id; when absent, `request` says what to fetch."""

    request: dict[str, JsonValue] = Field(default_factory=lambda: {})
    """A custom request for a live source, overriding the preset's."""

    mode: Literal["live", "snapshot"] = "live"
    """Fetch live, or read the recorded snapshot of a preset."""


class Fetched(BaseModel):
    """An input text fetched from a source."""

    source: SourceKind
    """The source it came from."""

    preset: str | None
    """The preset it was fetched for."""

    text: str
    """The input text, ready for the editor and for jq."""

    format: InputFormat
    """Format of the text."""

    snapshot: bool
    """Whether it was read from a recorded snapshot rather than fetched live."""

    cached: bool = False
    """Whether a live response was reused from the cache."""

    url: str | None = None
    """What was requested, for a live fetch."""

    bytes: int
    """Size of the text."""


class Source(Protocol):
    """An input source."""

    def info(self) -> SourceInfo:
        """Describe the source and its presets."""
        ...

    async def fetch(self, request: FetchRequest) -> Fetched:
        """Fetch one input."""
        ...


def dump_json(value: Any) -> str:
    """JSON text for the editor: indented when small, compact when large."""
    compact = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(compact.encode()) > PRETTY_LIMIT_BYTES:
        return compact + "\n"
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def snapshot_path(source: SourceKind, preset: str) -> Path:
    """Where the recorded snapshot of a live preset lives."""
    return FIXTURES_DIR / source / f"{preset}.json"


class TtlCache:
    """A small time-to-live cache for live responses."""

    def __init__(self, ttl_seconds: float) -> None:
        """Keep entries for `ttl_seconds`."""
        self.ttl = ttl_seconds
        self._entries: dict[str, tuple[float, str]] = {}

    def get(self, key: str) -> str | None:
        """The cached text for a key, if it is still fresh."""
        entry = self._entries.get(key)
        if entry is None:
            return None
        stored, text = entry
        if time.monotonic() - stored > self.ttl:
            del self._entries[key]
            return None
        return text

    def put(self, key: str, text: str) -> None:
        """Remember a text under a key."""
        self._entries[key] = (time.monotonic(), text)
