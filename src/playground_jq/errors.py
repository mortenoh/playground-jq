"""One error envelope for every refusal, in the shape RFC 9457 describes."""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from playground_jq.logging import get_logger

_logger = get_logger("errors")


class Issue(BaseModel):
    """One field-level problem inside a refusal."""

    loc: list[str | int] = Field(default_factory=lambda: [])
    """Where the problem is, as a path into the request."""

    msg: str
    """What is wrong there."""


class Problem(BaseModel):
    """A problem document (RFC 9457)."""

    status: int
    """HTTP status code."""

    title: str
    """Short phrase for the status."""

    detail: str
    """What went wrong, for a person."""

    code: str
    """Stable machine-readable code."""

    problems: list[Issue] = Field(default_factory=lambda: [])
    """Field-level problems, when the refusal has any."""

    instance: str | None = None
    """The path that was asked for."""


class Refusal(Exception):
    """A refusal a route or service raises, answered as a problem document."""

    def __init__(self, detail: str, *, code: str, status: int = 400) -> None:
        """Carry the detail, the stable code, and the HTTP status of this refusal."""
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.status = status


def render(
    status: int, detail: str, *, code: str, problems: list[Issue] | None = None, instance: str | None
) -> Problem:
    """Build the one problem shape."""
    try:
        title = HTTPStatus(status).phrase
    except ValueError:  # pragma: no cover - a non-standard status
        title = "Error"
    return Problem(status=status, title=title, detail=detail, code=code, problems=problems or [], instance=instance)


def answer(problem: Problem) -> JSONResponse:
    """Serialise a problem into a response."""
    return JSONResponse(
        status_code=problem.status,
        content=problem.model_dump(mode="json"),
        media_type="application/problem+json",
    )


async def http_error(request: Request, error: Exception) -> JSONResponse:
    """Render the framework's own HTTP errors (404, 405, ...) as problems."""
    if not isinstance(error, StarletteHTTPException):  # pragma: no cover - registered for this class
        return await unhandled(request, error)
    return answer(render(error.status_code, str(error.detail), code="http_error", instance=request.url.path))


async def validation_error(request: Request, error: Exception) -> JSONResponse:
    """Render a request-validation failure with its field list."""
    if not isinstance(error, RequestValidationError):  # pragma: no cover - registered for this class
        return await unhandled(request, error)
    issues: list[Issue] = []
    for item in error.errors():
        entry: dict[str, Any] = dict(item)
        issues.append(Issue(loc=[part for part in entry.get("loc", ())], msg=str(entry.get("msg", ""))))
    detail = "; ".join(f"{'.'.join(str(part) for part in issue.loc)}: {issue.msg}" for issue in issues)
    return answer(render(422, detail, code="request_invalid", problems=issues, instance=request.url.path))


async def refusal(request: Request, error: Exception) -> JSONResponse:
    """Render a Refusal at the status it carries."""
    if not isinstance(error, Refusal):  # pragma: no cover - registered for this class
        return await unhandled(request, error)
    return answer(render(error.status, error.detail, code=error.code, instance=request.url.path))


async def unhandled(request: Request, error: Exception) -> JSONResponse:
    """Log an unhandled exception and answer with a generic 500 that says nothing about it."""
    _logger.exception("unhandled error", path=request.url.path, error=type(error).__name__)
    return answer(render(500, "An internal error occurred.", code="internal", instance=request.url.path))


def install_error_handlers(app: FastAPI) -> None:
    """Answer every error the app raises with a problem document."""
    app.add_exception_handler(StarletteHTTPException, http_error)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(Refusal, refusal)
    app.add_exception_handler(Exception, unhandled)
