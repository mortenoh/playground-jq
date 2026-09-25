"""What routes read from the application state."""

from typing import TYPE_CHECKING, cast

from fastapi import Request

from playground_jq.config import Settings
from playground_jq.sources.registry import Sources

if TYPE_CHECKING:
    from playground_jq.content.library import Library


def settings_of(request: Request) -> Settings:
    """The settings the app was built with."""
    return cast("Settings", request.app.state.settings)


def sources_of(request: Request) -> Sources:
    """The input sources."""
    return cast("Sources", request.app.state.sources)


def library_of(request: Request) -> "Library":
    """The loaded examples, tutorials and guide."""
    return cast("Library", request.app.state.library)
