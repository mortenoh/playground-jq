import json
from pathlib import Path
from typing import Any

import pytest

from playground_jq.config import Settings
from playground_jq.errors import Refusal
from playground_jq.sources import registry as registry_module
from playground_jq.sources.base import FetchRequest, SourceKind
from playground_jq.sources.dhis2 import Dhis2Request, Dhis2Source
from playground_jq.sources.registry import Sources


class FakeClient:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail = fail
        self.raw_version = "2.43.0"

    async def get_raw(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append((path, params or {}))
        if self.fail:
            raise RuntimeError("409 analytics tables missing")
        return {"path": path, "params": params}


def live_source(client: FakeClient) -> Dhis2Source:
    source = Dhis2Source(Settings(dhis2_enabled=True))
    source._client = client  # pyright: ignore[reportPrivateUsage]
    return source


async def test_live_fetch_lowercases_booleans_and_caches() -> None:
    client = FakeClient()
    source = live_source(client)
    fetched = await source.fetch(FetchRequest(preset="org-units-geometry"))
    body = json.loads(fetched.text)
    assert body["path"] == "/api/organisationUnits"
    assert body["params"]["paging"] == "false"
    assert not fetched.snapshot
    again = await source.fetch(FetchRequest(preset="org-units-geometry"))
    assert again.cached
    assert len(client.calls) == 1


async def test_custom_request_and_refusals() -> None:
    client = FakeClient()
    source = live_source(client)
    fetched = await source.fetch(FetchRequest(request={"path": "/api/me", "params": {"fields": "id"}}))
    assert json.loads(fetched.text)["path"] == "/api/me"
    with pytest.raises(Refusal):
        source.resolve(FetchRequest(preset="nope"))
    with pytest.raises(Refusal):
        source.resolve(FetchRequest(request={"params": "not a map"}))
    with pytest.raises(Refusal):
        source.snapshot(None)


async def test_dhis2_errors_become_refusals() -> None:
    source = live_source(FakeClient(fail=True))
    with pytest.raises(Refusal) as refused:
        await source.get(Dhis2Request(path="/api/analytics"))
    assert refused.value.code == "source_failed"


async def test_unresolvable_profile_makes_the_source_snapshot_only() -> None:
    source = Dhis2Source(Settings(dhis2_profile="no-such-profile-anywhere", dhis2_enabled=True))
    assert not source.info().available
    with pytest.raises(Refusal) as refused:
        await source.fetch(FetchRequest(preset="system-info"))
    assert refused.value.status in {502, 503}
    await source.close()


async def test_record_writes_snapshots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def to_tmp(source: SourceKind, preset: str) -> Path:
        return tmp_path / source / f"{preset}.json"

    monkeypatch.setattr(registry_module, "snapshot_path", to_tmp)
    sources = Sources(Settings(dhis2_enabled=True))
    client = FakeClient()
    sources.dhis2._client = client  # pyright: ignore[reportPrivateUsage]
    results = await sources.record("dhis2")
    assert all(result.ok for result in results)
    assert (tmp_path / "dhis2" / "system-info.json").is_file()
    client.fail = True
    sources.dhis2.cache = type(sources.dhis2.cache)(0)
    failed = await sources.record("dhis2")
    assert not any(result.ok for result in failed)
