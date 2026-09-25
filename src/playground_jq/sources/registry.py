"""Every source the playground reads input from, and recording live presets as snapshots."""

import json

from pydantic import BaseModel

from playground_jq.config import Settings
from playground_jq.errors import Refusal
from playground_jq.logging import get_logger
from playground_jq.sources.base import Fetched, FetchRequest, SourceInfo, SourceKind, dump_json, snapshot_path
from playground_jq.sources.dhis2 import Dhis2Source
from playground_jq.sources.echo import EchoSource
from playground_jq.sources.static import StaticSource

_logger = get_logger("sources")


class InputRef(BaseModel):
    """A reference to one preset of one source, written `source:preset`."""

    source: SourceKind
    preset: str

    @classmethod
    def parse(cls, text: str) -> "InputRef":
        """Read `source:preset`."""
        source, _, preset = text.partition(":")
        if not preset:
            raise ValueError(f"an input reference is written source:preset, not {text}")
        return cls.model_validate({"source": source, "preset": preset})

    def __str__(self) -> str:
        """Write `source:preset`."""
        return f"{self.source}:{self.preset}"


class RecordResult(BaseModel):
    """What recording one preset did."""

    source: SourceKind
    preset: str
    ok: bool
    bytes: int = 0
    error: str | None = None


class Sources:
    """The static, postman-echo and DHIS2 sources."""

    def __init__(self, settings: Settings) -> None:
        """Build every source from the settings."""
        self.static = StaticSource()
        self.echo = EchoSource(settings)
        self.dhis2 = Dhis2Source(settings)

    def get(self, source: str) -> StaticSource | EchoSource | Dhis2Source:
        """One source by id."""
        match source:
            case "static":
                return self.static
            case "echo":
                return self.echo
            case "dhis2":
                return self.dhis2
            case _:
                raise Refusal(f"there is no source named {source}", code="unknown_source", status=404)

    def infos(self) -> list[SourceInfo]:
        """Describe every source."""
        return [self.static.info(), self.echo.info(), self.dhis2.info()]

    async def fetch(self, source: str, request: FetchRequest) -> Fetched:
        """Fetch from one source."""
        return await self.get(source).fetch(request)

    async def read(self, ref: InputRef, *, live: bool = False) -> Fetched:
        """The input a reference names: live when asked and the source is live, the snapshot otherwise."""
        mode = "live" if live and ref.source != "static" else "snapshot"
        return await self.fetch(ref.source, FetchRequest(preset=ref.preset, mode=mode))

    async def record(self, source: SourceKind) -> list[RecordResult]:
        """Fetch every preset of a live source and write it as its snapshot."""
        live = self.get(source)
        if isinstance(live, StaticSource):
            raise Refusal("static datasets are written by hand, not recorded", code="not_recordable", status=422)
        results: list[RecordResult] = []
        for preset in live.presets:
            try:
                fetched = await live.fetch(FetchRequest(preset=preset, mode="live"))
            except Refusal as error:
                _logger.warning("record failed", source=source, preset=preset, error=error.detail)
                results.append(RecordResult(source=source, preset=preset, ok=False, error=error.detail))
                continue
            text = dump_json(json.loads(fetched.text))
            path = snapshot_path(source, preset)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            results.append(RecordResult(source=source, preset=preset, ok=True, bytes=len(text.encode())))
        return results

    async def close(self) -> None:
        """Close any open connections."""
        await self.dhis2.close()
