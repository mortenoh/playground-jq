"""The web UI: a built single-page bundle served by the API server itself.

`/assets` and `/config.json` are registered before the routers; the shell is mounted at `/`
after them and claims whatever is left. The UI uses clean paths, so a browser navigation that
no route and no file claimed is answered with `index.html`, and every other 404 stays a problem.
"""

from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from playground_jq import __version__
from playground_jq.config import Settings
from playground_jq.errors import http_error

INDEX_FILENAME = "index.html"
ASSETS_MOUNT_PATH = "/assets"
CONFIG_PATH = "/config.json"

#: A content-hashed file never goes stale.
IMMUTABLE = "public, max-age=31536000, immutable"

#: The shell names the current hashes, so it is always revalidated.
REVALIDATE = "no-cache"

HTML_ACCEPT = ("text/html", "application/xhtml+xml")

#: Paths the shell never answers for.
RESERVED_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json", ASSETS_MOUNT_PATH, CONFIG_PATH)

BUNDLE_MISSING = (
    "The web UI is enabled and no bundle is built. Build one with `make ui`, or run the "
    "frontend dev server with `make ui-dev`. The API itself is serving normally."
)

#: The bundle inside the installed package.
PACKAGED_STATIC = Path(__file__).resolve().parent / "static"

#: The bundle vite leaves in a checkout.
CHECKOUT_STATIC = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class UiStaticFiles(StaticFiles):
    """Static files with an explicit cache policy, tolerant of a directory built later."""

    def __init__(self, *, directory: Path, html: bool = False, immutable: bool = False) -> None:
        """Serve one directory, as the hashed asset tree or as the shell's root."""
        super().__init__(directory=directory, html=html, check_dir=False)
        self.immutable = immutable

    async def check_config(self) -> None:
        """Verify the directory only once it exists."""
        if self.directory is not None and Path(self.directory).is_dir():
            await super().check_config()

    async def get_response(self, path: str, scope: Scope) -> Response:
        """Answer one static file with its cache policy."""
        response = await super().get_response(path, scope)
        served = 200 <= response.status_code < 400
        response.headers["cache-control"] = IMMUTABLE if self.immutable and served else REVALIDATE
        return response


def serving_root(settings: Settings) -> Path | None:
    """Where the bundle is, or where a build will put it."""
    if not settings.ui_enabled:
        return None
    if settings.ui_dir is not None:
        return settings.ui_dir
    for candidate in (PACKAGED_STATIC, CHECKOUT_STATIC):
        if (candidate / INDEX_FILENAME).is_file():
            return candidate
    if CHECKOUT_STATIC.parent.is_dir():
        return CHECKOUT_STATIC
    return PACKAGED_STATIC


def mount_ui_assets(app: FastAPI, settings: Settings) -> None:
    """Register `/config.json` and the hashed asset tree, before every router."""

    @app.get(CONFIG_PATH, include_in_schema=False)
    async def config() -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        return JSONResponse(
            {"api_prefix": settings.api_prefix, "version": __version__},
            headers={"cache-control": REVALIDATE},
        )

    directory = serving_root(settings)
    if directory is None:
        return
    app.mount(
        ASSETS_MOUNT_PATH,
        UiStaticFiles(directory=directory / ASSETS_MOUNT_PATH.lstrip("/"), immutable=True),
        name="ui-assets",
    )


def mount_ui_shell(app: FastAPI, settings: Settings) -> None:
    """Mount the shell at `/`, after every router, and answer client routes with it."""
    directory = serving_root(settings)
    if directory is None:
        return
    app.mount("/", UiStaticFiles(directory=directory, html=True), name="ui")
    index = directory / INDEX_FILENAME
    reserved = (settings.api_prefix, *RESERVED_PREFIXES)

    async def shell_or_404(request: Request, error: Exception) -> Response:
        at_root = request.url.path == "/" and request.method in ("GET", "HEAD")
        if (_is_navigation(request) or at_root) and not request.url.path.startswith(reserved):
            if index.is_file():
                return FileResponse(index, media_type="text/html", headers={"cache-control": REVALIDATE})
            return PlainTextResponse(
                BUNDLE_MISSING,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                headers={"cache-control": REVALIDATE},
            )
        return await http_error(request, error)

    app.add_exception_handler(status.HTTP_404_NOT_FOUND, shell_or_404)


def _is_navigation(request: Request) -> bool:
    """Whether a browser is asking for a page rather than code asking for data."""
    if request.method not in ("GET", "HEAD"):
        return False
    accepted = request.headers.get("accept", "")
    return any(media_type in accepted for media_type in HTML_ACCEPT)
