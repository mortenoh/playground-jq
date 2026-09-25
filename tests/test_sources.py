import json

import httpx2 as httpx
import pytest

from playground_jq.config import Settings
from playground_jq.errors import Refusal
from playground_jq.sources.base import FetchRequest, TtlCache, dump_json
from playground_jq.sources.dhis2 import PRESETS as DHIS2_PRESETS
from playground_jq.sources.dhis2 import Dhis2Source
from playground_jq.sources.echo import PRESETS as ECHO_PRESETS
from playground_jq.sources.echo import EchoSource, scrub
from playground_jq.sources.geojson import is_geojson, validate_geojson
from playground_jq.sources.registry import InputRef, Sources


def echo_transport(seen: list[httpx.Request]) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json={"args": dict(request.url.params), "headers": {"x-real-ip": "1.2.3.4", "host": "postman-echo.com"}},
        )

    return httpx.MockTransport(handle)


async def test_static_source_reads_a_dataset(sources: Sources) -> None:
    info = sources.static.info()
    assert info.presets
    first = info.presets[0].id
    fetched = await sources.fetch("static", FetchRequest(preset=first))
    assert fetched.snapshot
    assert fetched.bytes == len(fetched.text.encode())


async def test_static_source_refuses_unknown_presets(sources: Sources) -> None:
    with pytest.raises(Refusal) as refused:
        await sources.fetch("static", FetchRequest(preset="nope"))
    assert refused.value.status == 404
    with pytest.raises(Refusal):
        await sources.fetch("static", FetchRequest())


async def test_echo_sends_the_preset_and_scrubs_private_headers(settings: Settings) -> None:
    seen: list[httpx.Request] = []
    echo = EchoSource(settings, transport=echo_transport(seen))
    fetched = await echo.fetch(FetchRequest(preset="get-args"))
    body = json.loads(fetched.text)
    assert body["args"]["name"] == "playground"
    assert "x-real-ip" not in body["headers"]
    assert seen[0].headers["user-agent"] == "playground-jq"
    again = await echo.fetch(FetchRequest(preset="get-args"))
    assert again.cached
    assert len(seen) == 1


async def test_echo_custom_request_overrides_the_preset(settings: Settings) -> None:
    seen: list[httpx.Request] = []
    echo = EchoSource(settings, transport=echo_transport(seen))
    await echo.fetch(FetchRequest(preset="post-json", request={"query": {"q": "1"}}))
    assert seen[0].method == "POST"
    assert seen[0].url.params["q"] == "1"
    with pytest.raises(Refusal):
        echo.resolve(FetchRequest(request={"path": "no-slash"}))
    with pytest.raises(Refusal):
        echo.resolve(FetchRequest(request={"method": "TRACE"}))


async def test_echo_reports_non_json_and_unreachable(settings: Settings) -> None:
    text = EchoSource(settings, transport=httpx.MockTransport(lambda _: httpx.Response(200, text="<html>")))
    with pytest.raises(Refusal) as not_json:
        await text.fetch(FetchRequest(preset="gzip"))
    assert not_json.value.code == "source_not_json"

    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    down = EchoSource(settings, transport=httpx.MockTransport(fail))
    with pytest.raises(Refusal) as unreachable:
        await down.fetch(FetchRequest(preset="gzip"))
    assert unreachable.value.status == 502


@pytest.mark.parametrize("preset", [preset.id for preset, _ in ECHO_PRESETS])
async def test_every_echo_preset_has_a_snapshot(settings: Settings, preset: str) -> None:
    fetched = await EchoSource(settings).fetch(FetchRequest(preset=preset, mode="snapshot"))
    assert fetched.snapshot
    json.loads(fetched.text)


@pytest.mark.parametrize("preset", [preset.id for preset, _ in DHIS2_PRESETS])
async def test_every_dhis2_preset_has_a_snapshot(settings: Settings, preset: str) -> None:
    fetched = await Dhis2Source(settings).fetch(FetchRequest(preset=preset, mode="snapshot"))
    value = json.loads(fetched.text)
    if fetched.format == "geojson":
        assert is_geojson(value)


async def test_dhis2_refuses_paths_outside_the_api(settings: Settings) -> None:
    dhis2 = Dhis2Source(settings)
    with pytest.raises(Refusal):
        dhis2.resolve(FetchRequest(request={"path": "/dhis-web-commons/x"}))
    with pytest.raises(Refusal):
        dhis2.resolve(FetchRequest(request={"path": "/api/../x"}))
    assert dhis2.resolve(FetchRequest(preset="system-info")).path == "/api/system/info"


async def test_dhis2_live_is_refused_when_disabled(settings: Settings) -> None:
    with pytest.raises(Refusal) as refused:
        await Dhis2Source(settings).fetch(FetchRequest(preset="system-info"))
    assert refused.value.code == "source_disabled"


async def test_record_refuses_static(sources: Sources) -> None:
    with pytest.raises(Refusal):
        await sources.record("static")


def test_input_refs() -> None:
    ref = InputRef.parse("dhis2:system-info")
    assert (ref.source, ref.preset, str(ref)) == ("dhis2", "system-info", "dhis2:system-info")
    with pytest.raises(ValueError):
        InputRef.parse("bookstore")


def test_dump_json_keeps_large_values_compact() -> None:
    assert dump_json({"a": 1}) == '{\n  "a": 1\n}\n'
    large = dump_json({"a": "x" * 300_000})
    assert "\n" not in large.rstrip("\n")


def test_ttl_cache_expires() -> None:
    cache = TtlCache(ttl_seconds=0)
    cache.put("k", "v")
    assert cache.get("k") is None
    assert cache.get("missing") is None
    fresh = TtlCache(ttl_seconds=60)
    fresh.put("k", "v")
    assert fresh.get("k") == "v"


def test_scrub_nested() -> None:
    assert scrub({"a": [{"X-Real-IP": "x", "b": 1}]}) == {"a": [{"b": 1}]}


def test_geojson_validation() -> None:
    valid = validate_geojson({"type": "FeatureCollection", "features": []})
    assert valid.valid
    assert valid.features == 0
    invalid = validate_geojson({"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]})
    assert not invalid.valid
    assert invalid.problems
    assert not is_geojson([1])
    assert not is_geojson({"type": "Circle"})
