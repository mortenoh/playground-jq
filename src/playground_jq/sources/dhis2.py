"""DHIS2 through dhis2w: metadata, data values, tracker events, and a lot of GeoJSON."""

import asyncio
import json
from contextlib import AbstractAsyncContextManager
from typing import Any

from pydantic import BaseModel, Field, JsonValue, ValidationError

from playground_jq.config import Settings
from playground_jq.errors import Refusal
from playground_jq.logging import get_logger
from playground_jq.sources.base import Fetched, FetchRequest, Preset, SourceInfo, TtlCache, dump_json, snapshot_path

_logger = get_logger("dhis2")

#: The national root org unit of the Sierra Leone demo database.
SIERRA_LEONE = "ImspTQPwCqd"


class Dhis2Request(BaseModel):
    """One GET request to the DHIS2 Web API."""

    path: str
    params: dict[str, str | int | bool | list[str]] = Field(default_factory=lambda: {})


def _preset(
    id: str, title: str, description: str, path: str, params: dict[str, Any], *tags: str, fmt: str = "json"
) -> tuple[Preset, Dhis2Request]:
    """A preset and the request it sends."""
    preset = Preset.model_validate(
        {"id": id, "title": title, "description": description, "format": fmt, "tags": list(tags)}
    )
    return preset, Dhis2Request(path=path, params=params)


PRESETS: list[tuple[Preset, Dhis2Request]] = [
    _preset(
        "system-info",
        "System info",
        "Version, build, database and server details of the instance.",
        "/api/system/info",
        {},
        "metadata",
    ),
    _preset(
        "org-units-geojson-level-2",
        "Districts as GeoJSON",
        "A FeatureCollection of the 13 districts (level 2), polygons with properties.",
        "/api/organisationUnits.geojson",
        {"level": 2},
        "geojson",
        fmt="geojson",
    ),
    _preset(
        "org-units-geojson-level-3",
        "Chiefdoms as GeoJSON",
        "A FeatureCollection of chiefdoms (level 3): Polygon and MultiPolygon geometries.",
        "/api/organisationUnits.geojson",
        {"level": 3},
        "geojson",
        fmt="geojson",
    ),
    _preset(
        "org-units-geojson-level-4",
        "Facilities as GeoJSON",
        "A FeatureCollection of health facilities (level 4) as Points, with parent graph and groups.",
        "/api/organisationUnits.geojson",
        {"level": 4},
        "geojson",
        fmt="geojson",
    ),
    _preset(
        "org-units-geometry",
        "District geometry fields",
        "District org units with `geometry` as a field of the regular metadata response.",
        "/api/organisationUnits",
        {"level": 2, "fields": "id,name,code,level,geometry", "paging": False},
        "geojson",
        "metadata",
    ),
    _preset(
        "geo-features-level-2",
        "geoFeatures for districts",
        "DHIS2's own map format: short keys and coordinates encoded as a JSON string. Reshape it into GeoJSON.",
        "/api/geoFeatures",
        {"ou": f"ou:{SIERRA_LEONE};LEVEL-2"},
        "geojson",
    ),
    _preset(
        "geo-features-facilities-bo",
        "geoFeatures for facilities in Bo",
        "Facility points in the Bo district in geoFeatures form.",
        "/api/geoFeatures",
        {"ou": "ou:O6uvpzGd5pu;LEVEL-4"},
        "geojson",
    ),
    _preset(
        "org-unit-tree",
        "Org unit tree (levels 1-3)",
        "Org units down to chiefdoms with path, level, parent and children, unpaged.",
        "/api/organisationUnits",
        {
            "fields": "id,name,shortName,code,level,path,openingDate,closedDate,parent[id,name],children[id]",
            "filter": "level:le:3",
            "paging": False,
            "order": "level:asc,name:asc",
        },
        "metadata",
        "tree",
    ),
    _preset(
        "org-unit-levels",
        "Org unit levels",
        "The names of the hierarchy levels.",
        "/api/organisationUnitLevels",
        {"fields": "id,name,level", "paging": False, "order": "level:asc"},
        "metadata",
    ),
    _preset(
        "org-unit-groups",
        "Org unit groups",
        "Facility type and ownership groups with their member counts.",
        "/api/organisationUnitGroups",
        {"fields": "id,name,shortName,organisationUnits~size~rename(members),groupSets[id,name]", "paging": False},
        "metadata",
    ),
    _preset(
        "data-elements",
        "Data elements",
        "The first page of 100 data elements with value type, aggregation, category combo and groups.",
        "/api/dataElements",
        {
            "fields": "id,name,shortName,code,valueType,aggregationType,domainType,zeroIsSignificant,"
            "categoryCombo[id,name],dataElementGroups[id,name]",
            "pageSize": 100,
            "order": "name:asc",
        },
        "metadata",
    ),
    _preset(
        "data-element-groups",
        "Data element groups",
        "Data element groups with their members' ids and names.",
        "/api/dataElementGroups",
        {"fields": "id,name,dataElements[id,name]", "paging": False},
        "metadata",
    ),
    _preset(
        "indicators",
        "Indicators",
        "Indicators with their numerator and denominator expressions and indicator type.",
        "/api/indicators",
        {"fields": "id,name,numerator,denominator,annualized,indicatorType[name,factor]", "pageSize": 50},
        "metadata",
        "expressions",
    ),
    _preset(
        "data-sets",
        "Data sets",
        "Data sets with period type, element count and assigned org unit count.",
        "/api/dataSets",
        {
            "fields": "id,name,periodType,openFuturePeriods,dataSetElements~size~rename(elements),"
            "organisationUnits~size~rename(orgUnits),categoryCombo[name]",
            "paging": False,
        },
        "metadata",
    ),
    _preset(
        "category-combos",
        "Category combos",
        "Category combos with categories, options and generated option combos.",
        "/api/categoryCombos",
        {
            "fields": "id,name,dataDimensionType,categories[id,name,categoryOptions[id,name]],"
            "categoryOptionCombos[id,name]",
            "paging": False,
        },
        "metadata",
    ),
    _preset(
        "data-value-set",
        "Data value set (one facility, one month)",
        "Child Health values for one facility for January 2025, one row per data element and option combo.",
        "/api/dataValueSets",
        {"dataSet": "BfMAe6Itzgt", "period": "202501", "orgUnit": "DiszpKrYNg8"},
        "data",
    ),
    _preset(
        "data-value-set-bo-children",
        "Data values across Bo facilities",
        "One month of the Child Health data set across every facility in the Bo district, for aggregating with jq.",
        "/api/dataValueSets",
        {"dataSet": "BfMAe6Itzgt", "period": "202501", "orgUnit": "O6uvpzGd5pu", "children": True},
        "data",
    ),
    _preset(
        "tracker-events",
        "Tracker events (Inpatient morbidity)",
        "A page of events with their data values as `dataElement`/`value` pairs.",
        "/api/tracker/events",
        {
            "program": "eBAyeGv0exc",
            "pageSize": 25,
            "fields": "event,status,orgUnit,occurredAt,dataValues[dataElement,value]",
        },
        "tracker",
    ),
    _preset(
        "tracked-entities",
        "Tracked entities (Child programme)",
        "A page of tracked entities with attributes and enrollments.",
        "/api/tracker/trackedEntities",
        {
            "program": "IpHINAT79UW",
            "orgUnits": SIERRA_LEONE,
            "orgUnitMode": "DESCENDANTS",
            "pageSize": 15,
            "fields": "trackedEntity,orgUnit,createdAt,attributes[attribute,displayName,value],"
            "enrollments[enrollment,status,enrolledAt]",
        },
        "tracker",
    ),
    _preset(
        "schema-data-element",
        "Schema of the data element",
        "The metadata schema describing every property of a data element.",
        "/api/schemas/dataElement",
        {"fields": "name,klass,shareable,translatable,properties[name,propertyType,required,collection,length]"},
        "metadata",
    ),
    _preset(
        "users",
        "Users",
        "A page of users with roles, groups and assigned org units.",
        "/api/users",
        {
            "fields": "id,username,firstName,surname,disabled,lastLogin,userRoles[name],userGroups[name],"
            "organisationUnits[id,name]",
            "pageSize": 30,
        },
        "metadata",
    ),
]


class Dhis2Source:
    """The DHIS2 instance a dhis2w profile points at, or its recorded snapshots."""

    def __init__(self, settings: Settings) -> None:
        """Remember the profile; the client is opened on the first live fetch."""
        self.settings = settings
        self.presets = {preset.id: (preset, request) for preset, request in PRESETS}
        self.cache = TtlCache(settings.source_cache_seconds)
        self.base_url: str | None = None
        self._client: Any = None
        self._context: AbstractAsyncContextManager[Any] | None = None
        self._lock = asyncio.Lock()
        self._failure: str | None = None
        try:
            from dhis2w_core.profile import resolve

            self.base_url = str(resolve(settings.dhis2_profile).profile.base_url)
        except Exception as error:  # a missing or broken profile makes the source snapshot-only
            self._failure = f"profile {settings.dhis2_profile} could not be resolved: {error}"

    def info(self) -> SourceInfo:
        """Describe DHIS2 and its presets."""
        presets = [
            preset.model_copy(update={"request": request.model_dump(mode="json")})
            for preset, request in self.presets.values()
        ]
        return SourceInfo(
            id="dhis2",
            title=f"DHIS2 ({self.settings.dhis2_profile})",
            description="The DHIS2 Sierra Leone demo database, reached with dhis2w. Recorded snapshots work offline.",
            live=True,
            available=self.settings.dhis2_enabled and self._failure is None,
            presets=presets,
            base_url=self.base_url,
        )

    def resolve(self, request: FetchRequest) -> Dhis2Request:
        """The request to send: the preset's, overridden by any custom fields."""
        base: dict[str, Any] = {}
        if request.preset is not None:
            if request.preset not in self.presets:
                raise Refusal(f"there is no DHIS2 preset named {request.preset}", code="unknown_preset", status=404)
            base = self.presets[request.preset][1].model_dump()
        try:
            resolved = Dhis2Request.model_validate({**base, **request.request})
        except ValidationError as error:
            raise Refusal(f"the DHIS2 request is not valid: {error}", code="request_invalid", status=422) from error
        if not resolved.path.startswith("/api/") or ".." in resolved.path:
            raise Refusal("a DHIS2 path starts with /api/", code="request_invalid", status=422)
        return resolved

    async def fetch(self, request: FetchRequest) -> Fetched:
        """GET the request from DHIS2, or read the preset's snapshot."""
        if request.mode == "snapshot":
            return self.snapshot(request.preset)
        dhis2 = self.resolve(request)
        fmt = self.presets[request.preset][0].format if request.preset in self.presets else "json"
        key = dhis2.model_dump_json()
        cached = self.cache.get(key)
        if cached is not None:
            return Fetched(
                source="dhis2",
                preset=request.preset,
                text=cached,
                format=fmt,
                snapshot=False,
                cached=True,
                url=self._url(dhis2),
                bytes=len(cached.encode()),
            )
        body = await self.get(dhis2)
        text = dump_json(body)
        self.cache.put(key, text)
        return Fetched(
            source="dhis2",
            preset=request.preset,
            text=text,
            format=fmt,
            snapshot=False,
            url=self._url(dhis2),
            bytes=len(text.encode()),
        )

    def snapshot(self, preset: str | None) -> Fetched:
        """Read the recorded snapshot of a preset."""
        if preset is None or preset not in self.presets:
            raise Refusal("a snapshot is read by preset", code="preset_required", status=422)
        path = snapshot_path("dhis2", preset)
        if not path.is_file():
            raise Refusal(f"no snapshot is recorded for {preset}", code="no_snapshot", status=404)
        text = path.read_text()
        fmt = self.presets[preset][0].format
        return Fetched(source="dhis2", preset=preset, text=text, format=fmt, snapshot=True, bytes=len(text.encode()))

    async def get(self, request: Dhis2Request) -> JsonValue:
        """GET one path as JSON through the shared client."""
        if not self.settings.dhis2_enabled:
            raise Refusal("live DHIS2 is turned off; use a snapshot", code="source_disabled", status=503)
        client = await self._open()
        try:
            params = {
                key: (str(value).lower() if isinstance(value, bool) else value) for key, value in request.params.items()
            }
            # The response body as the API sends it: dhis2w's get_raw wraps a top-level array
            # (geoFeatures, for one) in {"data": ...}, which is not what DHIS2 answers.
            response = await client.get_response(request.path, params=params)
            if response.status_code >= 400:
                raise RuntimeError(f"{response.status_code} {response.text[:200]}")
            body: JsonValue = response.json()
        except Exception as error:
            _logger.warning("dhis2 request failed", path=request.path, error=str(error))
            raise Refusal(f"DHIS2 refused {request.path}: {error}", code="source_failed", status=502) from error
        normalised: JsonValue = json.loads(json.dumps(body))
        return normalised

    async def _open(self) -> Any:
        """The shared client, opened once on first use."""
        async with self._lock:
            if self._client is not None:
                return self._client
            if self._failure is not None:
                raise Refusal(self._failure, code="source_unavailable", status=503)
            try:
                from dhis2w_core.client_context import open_client
                from dhis2w_core.profile import resolve

                resolved = resolve(self.settings.dhis2_profile)
                self._context = open_client(resolved.profile, profile_name=resolved.name)
                self._client = await self._context.__aenter__()
            except Exception as error:
                self._context = None
                _logger.warning("dhis2 connection failed", profile=self.settings.dhis2_profile, error=str(error))
                raise Refusal(f"DHIS2 could not be reached: {error}", code="source_unreachable", status=502) from error
            _logger.info(
                "dhis2 connected",
                profile=self.settings.dhis2_profile,
                version=getattr(self._client, "raw_version", None),
            )
            return self._client

    async def close(self) -> None:
        """Close the shared client, if one was opened."""
        if self._context is not None:
            await self._context.__aexit__(None, None, None)
        self._client = None
        self._context = None

    def _url(self, request: Dhis2Request) -> str:
        """The URL a request reaches, for display."""
        return (self.base_url or "").rstrip("/") + request.path
