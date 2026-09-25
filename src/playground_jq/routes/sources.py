"""Input sources: static datasets, postman-echo and DHIS2."""

from typing import Annotated

from fastapi import APIRouter, Body, Depends
from pydantic import JsonValue

from playground_jq.routes.deps import sources_of
from playground_jq.sources.base import Fetched, FetchRequest, SourceInfo
from playground_jq.sources.geojson import GeoJsonReport, validate_geojson
from playground_jq.sources.registry import Sources

router = APIRouter(tags=["sources"])


@router.get("/sources")
async def list_sources(sources: Annotated[Sources, Depends(sources_of)]) -> list[SourceInfo]:
    """Every source and its presets."""
    return sources.infos()


@router.post("/sources/{source_id}/fetch")
async def fetch_source(source_id: str, body: FetchRequest, sources: Annotated[Sources, Depends(sources_of)]) -> Fetched:
    """Fetch one input from a source: a preset, a custom request, or a recorded snapshot."""
    return await sources.fetch(source_id, body)


@router.post("/geojson/validate")
async def validate(body: Annotated[JsonValue, Body()]) -> GeoJsonReport:
    """Validate a value as GeoJSON with geojson-pydantic."""
    return validate_geojson(body)
