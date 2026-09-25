"""The FastAPI application."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from playground_jq import __version__
from playground_jq.config import Settings, get_settings
from playground_jq.content.library import Library, load_library
from playground_jq.errors import install_error_handlers
from playground_jq.logging import get_logger
from playground_jq.routes import content, health, run, sources
from playground_jq.sources.registry import Sources
from playground_jq.ui import mount_ui_assets, mount_ui_shell

_logger = get_logger("app")

TAGS = [
    {"name": "run", "description": "Run jq programs."},
    {"name": "sources", "description": "Input sources: static datasets, postman-echo and DHIS2."},
    {"name": "content", "description": "Examples, tutorials, the guide and the builtin reference."},
    {"name": "health", "description": "Liveness."},
]


def build_router() -> APIRouter:
    """Every API route."""
    router = APIRouter()
    router.include_router(run.router)
    router.include_router(sources.router)
    router.include_router(content.router)
    return router


def create_app(settings: Settings | None = None, *, library: Library | None = None) -> FastAPI:
    """Build the application: API routes under the prefix, the UI around them."""
    resolved = settings or get_settings()
    loaded = library or load_library()
    registry = Sources(resolved)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        _logger.info(
            "server starting",
            examples=len(loaded.examples()),
            tutorials=len(loaded.tutorials),
            chapters=len(loaded.chapters),
            dhis2_profile=resolved.dhis2_profile,
        )
        try:
            yield
        finally:
            await registry.close()

    app = FastAPI(
        title="playground-jq",
        version=__version__,
        description="A playground, language guide, tutorials and example library for learning jq.",
        openapi_tags=TAGS,
        lifespan=lifespan,
    )
    app.state.settings = resolved
    app.state.sources = registry
    app.state.library = loaded
    install_error_handlers(app)
    if resolved.ui_enabled:
        mount_ui_assets(app, resolved)
    app.include_router(health.router)
    app.include_router(build_router(), prefix=resolved.api_prefix)
    if resolved.ui_enabled:
        mount_ui_shell(app, resolved)
    return app
