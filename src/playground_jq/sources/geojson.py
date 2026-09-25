"""GeoJSON validation with geojson-pydantic."""

from collections.abc import Sized
from typing import Annotated, Any, cast

from geojson_pydantic import (
    Feature,
    FeatureCollection,
    GeometryCollection,
    LineString,
    MultiLineString,
    MultiPoint,
    MultiPolygon,
    Point,
    Polygon,
)
from geojson_pydantic.geometries import Geometry
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

#: Every GeoJSON object type, told apart by its `type` member.
GeoJsonObject = Annotated[
    FeatureCollection[Feature[Geometry, Any]]
    | Feature[Geometry, Any]
    | Point
    | MultiPoint
    | LineString
    | MultiLineString
    | Polygon
    | MultiPolygon
    | GeometryCollection,
    Field(discriminator="type"),
]

_ADAPTER: TypeAdapter[Any] = TypeAdapter(GeoJsonObject)

#: The `type` values a GeoJSON object can have.
GEOJSON_TYPES = frozenset(
    {
        "FeatureCollection",
        "Feature",
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
        "Polygon",
        "MultiPolygon",
        "GeometryCollection",
    }
)


class GeoJsonReport(BaseModel):
    """Whether a value is valid GeoJSON, and what is wrong with it when it is not."""

    valid: bool
    """Whether the value validates as a GeoJSON object."""

    type: str | None = None
    """The GeoJSON `type` of the value."""

    features: int | None = None
    """Number of features, for a FeatureCollection."""

    problems: list[str] = Field(default_factory=lambda: [])
    """Validation messages, when the value is not valid."""


def validate_geojson(value: Any) -> GeoJsonReport:
    """Validate a value as GeoJSON and describe the result."""
    kind = _type_of(value)
    try:
        _ADAPTER.validate_python(value)
    except ValidationError as error:
        problems = [f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in error.errors()]
        return GeoJsonReport(valid=False, type=kind, problems=problems[:20])
    features = len(cast("Sized", cast("dict[str, object]", value)["features"])) if kind == "FeatureCollection" else None
    return GeoJsonReport(valid=True, type=kind, features=features)


def is_geojson(value: Any) -> bool:
    """Whether a value is a valid GeoJSON object (cheap check first, full validation after)."""
    if _type_of(value) not in GEOJSON_TYPES:
        return False
    return validate_geojson(value).valid


def _type_of(value: Any) -> str | None:
    """The `type` member of an object, if it has a string one."""
    if not isinstance(value, dict):
        return None
    mapping = cast("dict[str, object]", value)
    kind = mapping.get("type")
    return kind if isinstance(kind, str) else None
