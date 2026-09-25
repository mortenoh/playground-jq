"""Running a jq program."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from playground_jq.config import Settings
from playground_jq.jq.engine import run_program
from playground_jq.jq.models import RunOptions, RunResult
from playground_jq.routes.deps import settings_of, sources_of
from playground_jq.sources.base import FetchRequest
from playground_jq.sources.registry import Sources

router = APIRouter(tags=["run"])


class SourceInput(BaseModel):
    """An input fetched from a source instead of given as text."""

    id: str
    """The source id: `static`, `echo` or `dhis2`."""

    fetch: FetchRequest = Field(default_factory=FetchRequest)
    """What to fetch from it."""


class RunRequest(BaseModel):
    """A program, its input, and the flags to run it with."""

    program: str = Field(max_length=100_000)
    """The jq program."""

    input: str | None = None
    """The input text."""

    source: SourceInput | None = None
    """An input fetched from a source, used when `input` is absent."""

    options: RunOptions = Field(default_factory=RunOptions)
    """The command-line flags."""

    @model_validator(mode="after")
    def _one_input(self) -> "RunRequest":
        if self.input is not None and self.source is not None:
            raise ValueError("give either input or source, not both")
        return self


@router.post("/run")
async def run(
    body: RunRequest,
    settings: Annotated[Settings, Depends(settings_of)],
    sources: Annotated[Sources, Depends(sources_of)],
) -> RunResult:
    """Run a jq program over an input and answer with its outputs, formatted and structured."""
    text = body.input or ""
    if body.source is not None:
        fetched = await sources.fetch(body.source.id, body.source.fetch)
        text = fetched.text
    return await run_program(body.program, text, body.options, settings)
