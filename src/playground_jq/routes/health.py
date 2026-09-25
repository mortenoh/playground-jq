"""Liveness."""

from fastapi import APIRouter
from pydantic import BaseModel

from playground_jq import __version__

router = APIRouter(tags=["health"])


class Health(BaseModel):
    """The server is up."""

    status: str
    version: str


@router.get("/health")
async def health() -> Health:
    """Answer that the server is up, with its version."""
    return Health(status="ok", version=__version__)
