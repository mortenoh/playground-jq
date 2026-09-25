from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from playground_jq.app import create_app
from playground_jq.config import Settings
from playground_jq.content.library import Library, cached_library
from playground_jq.sources.registry import Sources


@pytest.fixture
def settings() -> Settings:
    return Settings(jq_timeout_seconds=2.0, dhis2_enabled=False, ui_enabled=False)


@pytest.fixture(scope="session")
def library() -> Library:
    return cached_library()


@pytest.fixture
def sources(settings: Settings) -> Sources:
    return Sources(settings)


@pytest.fixture
def client(settings: Settings, library: Library) -> Iterator[TestClient]:
    with TestClient(create_app(settings, library=library)) as test_client:
        yield test_client
